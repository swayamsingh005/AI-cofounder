import { createHook, FatalError } from 'workflow';
import { createAdminClient } from '../supabase/admin';
import { readGitHubToken } from '../connectors/credentials';
import { codingComplete } from '../ai';
import { draftGitHubIssueChange, draftGitHubObjectiveChange, reviseGitHubWorkspaceDraft, validateGitHubWorkspaceChange, type GitHubDraft } from '../connectors/github-write';
import { stopSandboxPreview, validateDraftInSandbox, type SandboxValidation } from './sandbox-validation';

export type CodingWorkflowInput = {
  actionId: string;
  companyId: string;
  userId: string;
  mode: 'create' | 'issue' | 'revise';
  objective?: string;
  issueNumber?: number;
  instruction?: string;
};

type PreparedBuild = {
  repository: string;
  branch: string;
  draft: GitHubDraft;
  previousPayload: Record<string, unknown>;
  conversation: { role: string; content: string }[];
};

async function clarificationQuestion(input: CodingWorkflowInput) {
  'use step';
  if (input.mode !== 'create') return '';
  console.info('[coding workflow] checking whether founder input is required', { actionId: input.actionId });
  try {
    const raw = await codingComplete(
      'Decide whether a software builder truly cannot proceed without one founder answer. Return JSON only: {"question":""}. Leave question empty when a safe, conventional assumption is possible. Ask at most one concise question and only when the answer materially changes the product, data model, authentication, payments, or target platform.',
      JSON.stringify({ objective: input.objective }), { maxTokens: 500, timeoutMs: 45000 },
    );
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/gi, '')) as { question?: unknown };
    return typeof parsed.question === 'string' ? parsed.question.trim().slice(0, 500) : '';
  } catch {
    return '';
  }
}

async function setProgress(actionId: string, companyId: string, phase: string, percent: number, detail: string) {
  'use step';
  console.info('[coding workflow] progress', { actionId, phase, percent });
  const db = createAdminClient();
  const current = await db.from('ai_actions').select('input_payload').eq('id', actionId).eq('company_id', companyId).single();
  if (current.error || !current.data) throw new FatalError('Coding workspace record no longer exists.');
  const update = await db.from('ai_actions').update({
    status: 'draft',
    error_message: null,
    input_payload: { ...(current.data.input_payload ?? {}), workflow_progress: { phase, percent, detail, updated_at: new Date().toISOString() } },
  }).eq('id', actionId).eq('company_id', companyId);
  if (update.error) throw new Error('Could not save Coding Agent progress.');
}

async function prepareBuild(input: CodingWorkflowInput): Promise<PreparedBuild> {
  'use step';
  console.info('[coding workflow] preparing files', { actionId: input.actionId, mode: input.mode });
  const db = createAdminClient();
  const [actionResult, connectionResult] = await Promise.all([
    db.from('ai_actions').select('*').eq('id', input.actionId).eq('company_id', input.companyId).eq('user_id', input.userId).single(),
    db.from('connections').select('id,connection_type,metadata').eq('company_id', input.companyId).eq('provider', 'github').eq('status', 'connected').single(),
  ]);
  if (actionResult.error || !actionResult.data) throw new FatalError('Coding workspace not found.');
  if (connectionResult.error || !connectionResult.data || connectionResult.data.connection_type !== 'oauth') throw new FatalError('Reconnect GitHub before continuing this build.');
  const token = await readGitHubToken(connectionResult.data.id, input.userId);
  if (!token) throw new FatalError('Reconnect GitHub before continuing this build.');
  const previousPayload = (actionResult.data.input_payload ?? {}) as Record<string, unknown>;
  const repository = String(connectionResult.data.metadata?.repository ?? previousPayload.repository ?? '');
  const branch = input.mode === 'revise' ? String(previousPayload.branch ?? '') : `ai-cofounder/build-${input.actionId.slice(0, 8)}`;
  const history = Array.isArray(previousPayload.coding_conversation) ? previousPayload.coding_conversation as { role: string; content: string }[] : [];
  let draft: GitHubDraft;
  if (input.mode === 'revise') {
    const current: GitHubDraft = {
      files: Array.isArray(previousPayload.files) ? previousPayload.files as { path: string; content: string }[] : [],
      title: String(actionResult.data.title ?? ''), body: String(actionResult.data.description ?? ''), emptyRepository: Boolean(previousPayload.empty_repository),
    };
    draft = await reviseGitHubWorkspaceDraft(repository, branch, String(input.instruction ?? ''), current, history,
      (system, user) => codingComplete(system, user, { maxTokens: 16000, timeoutMs: 120000 }));
  } else if (input.mode === 'issue') {
    draft = await draftGitHubIssueChange(token, repository, Number(input.issueNumber),
      (system, user) => codingComplete(system, user, { maxTokens: 10000, timeoutMs: 120000 }));
  } else {
    draft = await draftGitHubObjectiveChange(token, repository, String(input.objective ?? ''),
      (system, user) => codingComplete(system, user, { maxTokens: 12000, timeoutMs: 120000 }));
  }
  return { repository, branch, draft, previousPayload, conversation: history };
}

async function validateBuild(input: CodingWorkflowInput, prepared: PreparedBuild): Promise<SandboxValidation> {
  'use step';
  console.info('[coding workflow] validating build', { actionId: input.actionId, files: prepared.draft.files.length });
  const db = createAdminClient();
  const connection = await db.from('connections').select('id,connection_type').eq('company_id', input.companyId).eq('provider', 'github').eq('status', 'connected').single();
  if (connection.error || !connection.data || connection.data.connection_type !== 'oauth') throw new FatalError('Reconnect GitHub before validating this build.');
  const token = await readGitHubToken(connection.data.id, input.userId);
  if (!token) throw new FatalError('Reconnect GitHub before validating this build.');
  if (input.mode === 'revise') await stopSandboxPreview(prepared.previousPayload.validation);
  return validateDraftInSandbox(token, prepared.repository, prepared.draft);
}

async function finishBuild(input: CodingWorkflowInput, prepared: PreparedBuild, validation: SandboxValidation) {
  'use step';
  console.info('[coding workflow] saving review workspace', { actionId: input.actionId, validation: validation.status });
  const db = createAdminClient();
  const change = validateGitHubWorkspaceChange({ repository: prepared.repository, branch: prepared.branch, files: prepared.draft.files, title: prepared.draft.title, body: prepared.draft.body });
  const conversation = input.mode === 'revise'
    ? [...prepared.conversation.slice(-8), { role: 'user', content: String(input.instruction ?? '') }, { role: 'assistant', content: prepared.draft.body || `Updated ${prepared.draft.files.length} files.` }]
    : [{ role: 'user', content: input.mode === 'issue' ? `Build GitHub issue #${input.issueNumber}` : String(input.objective ?? '') }, { role: 'assistant', content: prepared.draft.body || `Prepared ${prepared.draft.files.length} files.` }];
  const payload = {
    ...prepared.previousPayload, ...change, validation,
    objective: input.objective ?? prepared.previousPayload.objective, issue_number: input.issueNumber ?? prepared.previousPayload.issue_number,
    empty_repository: Boolean(prepared.draft.emptyRepository), coding_conversation: conversation,
    revision_count: input.mode === 'revise' ? Number(prepared.previousPayload.revision_count ?? 0) + 1 : 0,
    workflow_progress: { phase: 'ready_for_review', percent: 100, detail: 'Code and checks are ready for your approval.', updated_at: new Date().toISOString() },
  };
  const saved = await db.from('ai_actions').update({ title: change.title, description: change.body, status: 'awaiting_approval', input_payload: payload, error_message: null }).eq('id', input.actionId).eq('company_id', input.companyId);
  if (saved.error) throw new Error('The completed coding workspace could not be saved.');
  return { actionId: input.actionId, validation: validation.status, previewUrl: validation.preview?.url ?? null };
}

async function markFailed(input: CodingWorkflowInput, message: string) {
  'use step';
  console.error('[coding workflow] failed', { actionId: input.actionId, message });
  const db = createAdminClient();
  const action = await db.from('ai_actions').select('input_payload').eq('id', input.actionId).eq('company_id', input.companyId).single();
  const previous = (action.data?.input_payload ?? {}) as Record<string, unknown>;
  await db.from('ai_actions').update({
    status: input.mode === 'revise' && Array.isArray(previous.files) ? 'awaiting_approval' : 'failed',
    error_message: message,
    input_payload: { ...previous, workflow_progress: { phase: 'failed', percent: 100, detail: message, updated_at: new Date().toISOString() } },
  }).eq('id', input.actionId).eq('company_id', input.companyId);
}

export async function codingAgentWorkflow(input: CodingWorkflowInput) {
  'use workflow';
  console.info('[coding workflow] started', { actionId: input.actionId, mode: input.mode });
  try {
    const question = await clarificationQuestion(input);
    let effectiveInput = input;
    if (question) {
      await setProgress(input.actionId, input.companyId, 'awaiting_clarification', 5, question);
      const answer = await createHook<{ answer: string }>({ token: `coding-clarification-${input.actionId}` });
      effectiveInput = { ...input, objective: `${input.objective ?? ''}\n\nFounder clarification: ${String(answer.answer ?? '').slice(0, 2000)}` };
    }
    await setProgress(input.actionId, input.companyId, 'planning', 10, 'Reading the repository and planning the change.');
    const prepared = await prepareBuild(effectiveInput);
    await setProgress(input.actionId, input.companyId, 'validating', 55, `Generated ${prepared.draft.files.length} files. Installing dependencies and running checks.`);
    const validation = await validateBuild(effectiveInput, prepared);
    await setProgress(input.actionId, input.companyId, 'saving_preview', 90, validation.preview ? 'Live preview is ready. Saving the review workspace.' : 'Checks finished. Saving the review workspace.');
    return await finishBuild(effectiveInput, prepared, validation);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Coding Agent run failed. Your previous workspace was preserved.';
    await markFailed(input, message);
    throw error;
  }
}
