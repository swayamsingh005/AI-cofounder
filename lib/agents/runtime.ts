import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '../supabase/admin';
import { loadCompanyContext, formatCompanyContext } from '../company-context';
import { groqComplete } from '../ai';
import { limits, planGoal } from './planner';
import { executeAnalysis, type Evidence } from './execution';
import { type AgentOutput } from './schema';
import { type AgentId } from './registry';
import { syncGitHub } from '../intelligence/engine';
import { readGitHubToken } from '../connectors/credentials';

export type AgentRun = {
  id: string; request_key: string; agent_id: AgentId; objective: string;
  step_index: number; depends_on: number[]; status: string; action_type: string;
  mission_id: string; task_id: string; output: AgentOutput | null; error_message: string | null;
  created_at: string; started_at: string | null; completed_at: string | null;
};
export async function runWorkflow(db: SupabaseClient, companyId: string, userId: string, goal: string, requestKey: string) {
  // Check again at the privileged boundary, independently of the API.
  const owner = await db.from('companies').select('id').eq('id', companyId).eq('user_id', userId).maybeSingle();
  if (owner.error || !owner.data) throw new Error('Company not found.');
  const config = limits();
  const steps = planGoal(goal, config.maxSteps);
  const admin = createAdminClient();
  const operation = async (op: string, data: Record<string, unknown> = {}) => {
    const result = await admin.rpc('agent_workflow', { p_company: companyId, p_user: userId, p_key: requestKey, p_op: op, p_data: data });
    if (result.error) throw new Error('Agent storage operation failed: ' + result.error.message);
    return result.data;
  };
  await operation('recover');
  let runs = await operation('start', { goal, steps }) as AgentRun[];
  // A replay returns stored results, or reports an in-flight request. It never repeats model calls.
  if (runs.some(r => r.status !== 'queued')) return runs;
  try {
    const ctx = await loadCompanyContext(db, companyId);
    if (!ctx) throw new Error('Company context is unavailable.');
    const needsGitHub = runs.some(run => run.action_type === 'analyze_github_issues');
    if (needsGitHub) {
      const connectionResult = await db.from('connections').select('id,connection_type,status').eq('company_id', companyId).eq('provider', 'github').maybeSingle();
      if (connectionResult.error || !connectionResult.data || connectionResult.data.status === 'disconnected') throw new Error('Connect GitHub before running the Coding Agent.');
      const token = connectionResult.data.connection_type === 'oauth' ? await readGitHubToken(connectionResult.data.id, userId) : undefined;
      if (connectionResult.data.connection_type === 'oauth' && !token) throw new Error('Reconnect GitHub before running the Coding Agent.');
      await syncGitHub(db, companyId, userId, token ?? undefined);
    }
    const evidence: Evidence[] = [
      ...ctx.recentMemories.map(m => ({ id: m.id, category: 'memory', content: m.title + ': ' + m.content })),
      ...ctx.tasks.map(t => ({ id: t.id, category: 'task', content: t.title + ': ' + t.status })),
      ...ctx.recentDecisions.map(d => ({ id: d.id, category: 'decision', content: d.title + ': ' + (d.reasoning ?? '') })),
    ];
    const github = await db.from('company_events').select('id,title,description').eq('company_id', companyId).eq('source', 'github').order('occurred_at', { ascending: false }).limit(30);
    if (github.error) throw new Error('Saved GitHub evidence could not be loaded.');
    const githubEvidence: Evidence[] = (github.data ?? []).map(e => ({ id: e.id, category: 'github', content: e.title + ': ' + (e.description ?? '') }));
    for (const run of runs) {
      const claimed = await operation('claim', { runId: run.id });
      if (!claimed) return runs;
      const start = Date.now();
      const suppliedEvidence = (run.agent_id === 'coding' ? [...githubEvidence, ...evidence] : evidence).slice(0,24);
      const dependencies = runs.filter(r => run.depends_on.includes(r.step_index) && r.output).map(r => ({ agentId: r.agent_id, output: r.output as AgentOutput }));
      let inputCharacters = 0;
      const output = await executeAnalysis(run.agent_id, run.action_type, {
        goal: run.objective, context: formatCompanyContext(ctx).slice(0,10000),
        evidence: suppliedEvidence.map(e => ({ ...e, content: e.content.slice(0,800) })), dependencies,
      }, (system, user) => {
        inputCharacters = system.length + user.length;
        return groqComplete(system, user, { json: true, maxTokens: config.maxTokens, temperature: 0.2, timeoutMs: config.timeoutMs, maxAttempts: 1 });
      }, config.maxActions);
      runs = await operation('finish', { runId: run.id, output, usage: { model: process.env.GROQ_MODEL ?? 'default candidate', modelCalls: 1, retries: 0, maxOutputTokens: config.maxTokens, inputCharacters, outputCharacters: JSON.stringify(output).length, durationMs: Date.now() - start, registryVersion: 1 } }) as AgentRun[];
    }
    return runs;
  } catch (error) {
    const message = error instanceof Error && /No saved GitHub|Invalid|Unknown evidence|permission|limit|require/i.test(error.message)
      ? error.message : 'Agent analysis failed or timed out. No external changes occurred. Review the run and start a new request to retry.';
    await operation('fail', { error: message });
    throw new Error(message);
  }
}
export function workflowAnswer(runs: AgentRun[]) {
  return runs.map(r => {
    const output = r.output;
    return `${r.agent_id.toUpperCase()} AGENT — ${r.status.replaceAll('_', ' ')}
${output ? [output.summary, ...output.findings.map(f => f.kind + ': ' + f.content), ...output.drafts, ...output.unknowns.map(u => 'Unknown: ' + u)].join('\n') : r.error_message ?? r.objective}
${r.status === 'waiting_approval' ? 'Review proposed tasks in the existing Approvals page.' : ''}`;
  }).join('\n\n') + '\n\nInternal analysis and drafts only. No external research, publishing, code changes or deployment occurred.';
}
