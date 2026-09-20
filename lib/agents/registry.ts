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
    description: 'Plan software work and prepare bounded, reviewable repository changes from GitHub issues.',
    instructions: 'Prioritize recorded issues and development tasks. In the approved GitHub workflow you may inspect a bounded repository snapshot and prepare up to five complete file changes. Every external change requires founder approval. You cannot merge a pull request or deploy production.',
    capabilities: ['Technical planning', 'Controlled repository workspace', 'Multi-file change drafts', 'GitHub pull requests', 'Repository check and Vercel preview status'],
    connectors: ['internal', 'github', 'vercel', 'supabase', 'vscode', 'drive'],
    actions: ['analyze_context', 'analyze_github_issues', 'create_task', 'github.create_pull_request'],
  },
  research: {
    id: 'research', name: 'Research Agent', version: 1, status: 'available',
    description: 'Research the market with traceable web sources and combine it with company evidence.',
    instructions: 'Analyze only supplied internal evidence and trusted runtime search results. Separate source-grounded observations from hypotheses. Cite supplied evidence IDs for every observation. Missing competitor data must be an unknown and a proposed validation step, never an invented competitor fact.',
    capabilities: ['Live source-grounded web research', 'Internal evidence synthesis', 'Traceable findings in company memory', 'Company Pulse evidence updates'],
    connectors: ['internal', 'web', 'drive', 'notion', 'gmail'],
    actions: ['analyze_context', 'create_task'],
  },
  marketing: {
    id: 'marketing', name: 'Marketing Agent', version: 1, status: 'available',
    description: 'Turn company and research evidence into channel-ready campaign, post and reel packages.',
    instructions: 'Prepare a concrete campaign strategy, audience, channel-ready post copy, reel scripts with shot guidance, and visual creative briefs using supplied context and dependency outputs. Separate supported claims from hypotheses. These are drafts. You cannot publish, send messages or generate finished media until an executable connector is configured and the founder approves it.',
    capabilities: ['Campaign planning', 'Evidence-based positioning', 'Channel-ready post copy', 'Reel scripts and shot lists', 'Canva-ready creative briefs'],
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
  'github.create_pull_request': { connector: 'github', permission: 'APPROVAL_REQUIRED', executable: true },
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
