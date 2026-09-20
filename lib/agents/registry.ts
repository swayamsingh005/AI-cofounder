export type AgentId = 'coding' | 'research' | 'marketing';
export type Permission = 'AUTO' | 'APPROVAL_REQUIRED' | 'RESTRICTED';
export type AgentDefinition = {
  id: AgentId; name: string; description: string; instructions: string;
  capabilities: readonly string[]; connectors: readonly string[];
  actions: readonly string[]; status: 'available'; version: number;
};

// Static configuration lives here, never in model output or user-editable rows.
export const AGENTS: Readonly<Record<AgentId, AgentDefinition>> = {
  coding: {
    id: 'coding', name: 'Coding Agent', version: 1, status: 'available',
    description: 'Analyze saved GitHub issues and prepare technical implementation plans.',
    instructions: 'Prioritize recorded issues and development tasks. Explain impact, evidence, and implementation steps. You cannot inspect source code, edit code, merge or deploy.',
    capabilities: ['Technical planning', 'Saved GitHub issue analysis', 'Propose development tasks'],
    connectors: ['internal', 'github', 'vercel', 'supabase', 'vscode', 'drive'],
    actions: ['analyze_context', 'analyze_github_issues', 'create_task'],
  },
  research: {
    id: 'research', name: 'Research Agent', version: 1, status: 'available',
    description: 'Synthesize company evidence into findings, unknowns and research plans.',
    instructions: 'Analyze only supplied evidence. Separate recorded observations from hypotheses. Missing competitor data must be an unknown and a proposed validation step, never an invented competitor fact. No live web search is available in this workflow.',
    capabilities: ['Internal evidence research', 'Competitor research planning', 'Structured findings'],
    connectors: ['internal', 'web', 'drive', 'notion', 'gmail'],
    actions: ['analyze_context', 'create_task'],
  },
  marketing: {
    id: 'marketing', name: 'Marketing Agent', version: 1, status: 'available',
    description: 'Prepare positioning, campaign strategy, draft copy and marketing tasks.',
    instructions: 'Prepare a concrete campaign strategy, audience, draft copy and creative briefs using supplied context and dependency outputs. These are drafts. You cannot publish, send messages or generate media.',
    capabilities: ['Campaign planning', 'Positioning', 'Draft copy and creative briefs'],
    connectors: ['internal', 'instagram', 'canva', 'higgsfield', 'gmail', 'drive'],
    actions: ['analyze_context', 'create_task'],
  },
};
export function isAgentId(value: unknown): value is AgentId {
  return typeof value === 'string' && Object.hasOwn(AGENTS, value);
}
export const ACTIONS: Readonly<Record<string, { connector: string; permission: Permission; executable: boolean }>> = {
  analyze_context: { connector: 'internal', permission: 'AUTO', executable: true },
  analyze_github_issues: { connector: 'github', permission: 'AUTO', executable: true },
  create_task: { connector: 'internal', permission: 'APPROVAL_REQUIRED', executable: true },
  'gmail.send_email': { connector: 'gmail', permission: 'APPROVAL_REQUIRED', executable: false },
  'instagram.publish': { connector: 'instagram', permission: 'APPROVAL_REQUIRED', executable: false },
  'vercel.production_deploy': { connector: 'vercel', permission: 'APPROVAL_REQUIRED', executable: false },
  'github.merge_pull_request': { connector: 'github', permission: 'APPROVAL_REQUIRED', executable: false },
  'finance.transfer': { connector: 'finance', permission: 'RESTRICTED', executable: false },
  'supabase.delete_data': { connector: 'supabase', permission: 'RESTRICTED', executable: false },
};
export function actionPolicy(agent: AgentId, type: string) {
  const action = Object.hasOwn(ACTIONS, type) ? ACTIONS[type] : undefined;
  if (!action || action.permission === 'RESTRICTED' || !action.executable ||
      !AGENTS[agent].actions.includes(type) || !AGENTS[agent].connectors.includes(action.connector)) {
    throw new Error('This agent is not permitted to execute that action.');
  }
  return action;
}
