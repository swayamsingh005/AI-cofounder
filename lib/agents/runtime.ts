import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '../supabase/admin';
import { loadCompanyContext, formatCompanyContext } from '../company-context';
import { codingComplete, groqComplete, tavilySearch } from '../ai';
import { limits, planGoal } from './planner';
import { executeAnalysis, type Evidence } from './execution';
import { type AgentOutput } from './schema';
import { type AgentId } from './registry';
import { refreshIntelligence, syncGitHub } from '../intelligence/engine';
import { readGitHubToken } from '../connectors/credentials';
import { draftGitHubObjectiveChange, validateGitHubWorkspaceChange } from '../connectors/github-write';
import { repositoryName } from '../connectors/base';

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
    const hasCoding = runs.some(run => run.agent_id === 'coding');
    const needsIssueSync = runs.some(run => run.action_type === 'analyze_github_issues');
    let codingToken: string | undefined;
    let codingRepository = '';
    if (hasCoding) {
      const connectionResult = await db.from('connections').select('id,connection_type,status,metadata').eq('company_id', companyId).eq('provider', 'github').maybeSingle();
      if (connectionResult.error || !connectionResult.data || connectionResult.data.status !== 'connected' || connectionResult.data.connection_type !== 'oauth') throw new Error('Reconnect GitHub with repository access before asking the Coding Agent to build software.');
      codingToken = (await readGitHubToken(connectionResult.data.id, userId)) ?? undefined;
      if (!codingToken) throw new Error('Reconnect GitHub before asking the Coding Agent to build software.');
      codingRepository = repositoryName(String(connectionResult.data.metadata?.repository ?? ''));
      if (needsIssueSync) await syncGitHub(db, companyId, userId, codingToken);
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
      // GitHub analysis must not inherit unrelated company tasks. They previously caused a
      // README issue analysis to propose payment and landing-page approvals.
      const githubOnly = run.action_type === 'analyze_github_issues';
      const webResearch = run.agent_id === 'research' ? await tavilySearch(`${run.objective} ${formatCompanyContext(ctx).slice(0,700)}`, 8) : { text:'', sources:[] };
      if(run.agent_id === 'research' && !webResearch.sources.length) throw new Error('Live source-grounded research is unavailable. Configure the research provider or retry later; no findings were invented.');
      const webEvidence:Evidence[]=webResearch.sources.map((source,index)=>({id:`web-${index+1}`,category:'web_source',content:`${source.title} (${source.domain}) ${source.url}: ${source.excerpt??''}`}));
      const suppliedEvidence = (githubOnly ? githubEvidence : [...evidence,...webEvidence]).slice(0,24);
      const dependencies = runs.filter(r => run.depends_on.includes(r.step_index) && r.output).map(r => ({ agentId: r.agent_id, output: r.output as AgentOutput }));
      let inputCharacters = 0;
      let preparedDraft:Awaited<ReturnType<typeof draftGitHubObjectiveChange>>|null=null;
      let output:AgentOutput;
      if(run.agent_id==='coding') {
        if(!codingToken||!codingRepository) throw new Error('Reconnect GitHub before asking the Coding Agent to build software.');
        // A coding request needs one model call that produces files. A separate analysis call
        // previously consumed the provider quota and could leave behind a misleading task record.
        preparedDraft=await draftGitHubObjectiveChange(codingToken,codingRepository,run.objective,(system,user)=>{
          inputCharacters=system.length+user.length;
          return codingComplete(system,user,{maxTokens:12000,timeoutMs:120000});
        });
        output={summary:'Repository files are prepared for founder review.',findings:[],drafts:[`Prepared ${preparedDraft.files.length} file${preparedDraft.files.length===1?'':'s'}: ${preparedDraft.files.map(file=>file.path).join(', ')}`],unknowns:[],sources:[],actions:[]};
      } else {
        output = await executeAnalysis(run.agent_id, run.action_type, {
          goal: run.objective,
          context: githubOnly ? 'Analyze only the connected GitHub issue evidence supplied in this request.' : formatCompanyContext(ctx).slice(0,10000),
          evidence: suppliedEvidence.map(e => ({ ...e, content: e.content.slice(0,800) })), dependencies,
        }, (system, user) => {
          inputCharacters = system.length + user.length;
          return groqComplete(system, user, { json: true, maxTokens: config.maxTokens, temperature: 0.2, timeoutMs: config.timeoutMs, maxAttempts: 1 });
        }, config.maxActions);
      }
      if(run.agent_id==='research') output={...output,sources:webResearch.sources.map((source,index)=>({id:`web-${index+1}`,title:source.title,url:source.url,domain:source.domain}))};
      runs = await operation('finish', { runId: run.id, output, usage: { model: run.agent_id==='coding'?(process.env.CODING_MODEL??'openai/gpt-5.6-sol'):(process.env.GROQ_MODEL ?? 'default candidate'), modelCalls: 1, retries: 0, maxOutputTokens: run.agent_id==='coding'?12000:config.maxTokens, inputCharacters, outputCharacters: JSON.stringify(output).length, durationMs: Date.now() - start, registryVersion: 1 } }) as AgentRun[];
      if(run.agent_id==='coding' && codingToken && codingRepository && preparedDraft) {
        const draft=preparedDraft;
        const branch=`ai-cofounder/build-${requestKey.slice(0,8)}`;
        const input=validateGitHubWorkspaceChange({repository:codingRepository,branch,files:draft.files,title:draft.title,body:draft.body});
        const prepared=await admin.from('ai_actions').upsert({company_id:companyId,user_id:userId,idempotency_key:`agent-build:${requestKey}`,provider:'github',action_type:'github.create_pull_request',title:draft.title,description:draft.body,risk_level:'medium',status:'awaiting_approval',requires_approval:true,input_payload:{...input,objective:run.objective,agent_run_id:run.id}},{onConflict:'company_id,idempotency_key',ignoreDuplicates:true});
        if(prepared.error) throw new Error('The Coding Agent finished its analysis but could not save the repository build for approval.');
      }
      if(run.agent_id==='research') {
        const grounded=output.findings.filter(f=>f.kind==='observation'&&f.evidenceIds.some(id=>id.startsWith('web-')));
        if(grounded.length) {
          const rows=grounded.map((finding,index)=>({company_id:companyId,user_id:userId,kind:'learning',title:`Research finding ${index+1}: ${run.objective}`.slice(0,200),content:finding.content,source:'ai',source_agent:'research',source_run_id:run.id,evidence:{evidenceIds:finding.evidenceIds,sources:output.sources.filter(source=>finding.evidenceIds.includes(source.id))}}));
          const saved=await admin.from('memories').insert(rows); if(saved.error) throw new Error('Source-grounded research could not be saved to company memory.');
          await refreshIntelligence(admin,companyId,userId);
        }
      }
    }
    return runs;
  } catch (error) {
    const message = error instanceof Error && /No saved GitHub|source-grounded research|Invalid|Unknown evidence|permission|limit|require/i.test(error.message)
      ? error.message : 'Agent analysis failed or timed out. No external changes occurred. Review the run and start a new request to retry.';
    await operation('fail', { error: message });
    throw new Error(message);
  }
}
export function workflowAnswer(runs: AgentRun[]) {
  const grounded=runs.some(r=>r.agent_id==='research'&&r.output?.sources?.length);
  const codingPrepared=runs.some(r=>r.agent_id==='coding'&&r.output);
  return runs.map(r => {
    const output = r.output;
    return `${r.agent_id.toUpperCase()} AGENT — ${r.status.replaceAll('_', ' ')}
${output ? [output.summary, ...output.findings.map(f => f.kind + ': ' + f.content), ...output.drafts, ...output.unknowns.map(u => 'Unknown: ' + u)].join('\n') : r.error_message ?? r.objective}
${r.status === 'waiting_approval' ? 'Review proposed tasks in the existing Approvals page.' : ''}`;
  }).join('\n\n') + `\n\n${codingPrepared?'The Coding Agent prepared a repository build in Approvals. Review its exact files before creating the GitHub branch and pull request. ':grounded?'Research findings include the recorded web sources shown in the run. ':'Internal analysis and drafts only. '}No publishing, merge or production deployment occurred.`;
}
