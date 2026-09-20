import { actionPolicy, isAgentId, type AgentId } from './registry';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid or oversized text.');
  // Do not persist recognizable credentials supplied by a model or founder.
  if (/(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9_.-]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN .*PRIVATE KEY-----)/i.test(value)) throw new Error('Remove credentials from the request.');
  return value.trim();
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new Error('Unexpected fields in model output.');
}
export type Step = { agentId: AgentId; objective: string; actionType: 'analyze_context' | 'analyze_github_issues'; dependsOn: number[] };
export function parsePlan(value: unknown, maxSteps = 3): Step[] {
  const root = object(value); keys(root, ['steps']);
  if (!Array.isArray(root.steps) || !root.steps.length || root.steps.length > maxSteps) throw new Error('Plan exceeds the step limit.');
  const seen = new Set<string>();
  return root.steps.map((item, index) => {
    const step = object(item); keys(step, ['agentId', 'objective', 'actionType', 'dependsOn']);
    if (!isAgentId(step.agentId) || seen.has(step.agentId)) throw new Error('Invalid or repeated agent.');
    seen.add(step.agentId);
    if (step.actionType !== 'analyze_context' && step.actionType !== 'analyze_github_issues') throw new Error('Invalid analysis action.');
    actionPolicy(step.agentId, step.actionType);
    if (!Array.isArray(step.dependsOn) || step.dependsOn.some(n => !Number.isInteger(n) || n < 0 || n >= index) || new Set(step.dependsOn).size !== step.dependsOn.length) throw new Error('Dependencies must refer to earlier steps.');
    return { agentId: step.agentId, objective: text(step.objective, 500), actionType: step.actionType, dependsOn: step.dependsOn as number[] };
  });
}
export type AgentOutput = {
  summary: string; findings: { content: string; evidenceIds: string[]; kind: 'observation' | 'hypothesis' }[];
  drafts: string[]; unknowns: string[]; actions: { actionType: 'create_task'; parameters: { title: string; description: string }; reason: string }[];
};
export function parseOutput(value: unknown, agent: AgentId, evidence: Set<string>, maxActions = 2): AgentOutput {
  const v = object(value); keys(v, ['summary', 'findings', 'drafts', 'unknowns', 'actions']);
  if (!Array.isArray(v.findings) || !Array.isArray(v.actions)) throw new Error('Invalid output list.');
  const findings = v.findings.slice(0, 6), actions = v.actions.slice(0, maxActions);
  const strings = (items: unknown) => {
    if (!Array.isArray(items)) throw new Error('Invalid output list.');
    return items.slice(0, 6).map(x => text(x, 2000));
  };
  return {
    summary: text(v.summary, 2500),
    findings: findings.map(item => {
      const f = object(item); keys(f, ['content', 'evidenceIds', 'kind']);
      if (f.kind !== 'observation' && f.kind !== 'hypothesis') throw new Error('Invalid finding category.');
      if (!Array.isArray(f.evidenceIds) || f.evidenceIds.length > 8 || f.evidenceIds.some(id => typeof id !== 'string' || !evidence.has(id))) throw new Error('Unknown evidence reference.');
      if (f.kind === 'observation' && !f.evidenceIds.length) throw new Error('Observations require recorded evidence.');
      return { content: text(f.content, 1500), kind: f.kind, evidenceIds: f.evidenceIds as string[] };
    }),
    drafts: strings(v.drafts), unknowns: strings(v.unknowns),
    actions: actions.map(item => {
      const a = object(item); keys(a, ['actionType', 'parameters', 'reason']);
      if (a.actionType !== 'create_task') throw new Error('Unsupported action request.');
      actionPolicy(agent, a.actionType);
      const p = object(a.parameters); keys(p, ['title', 'description']);
      return { actionType: 'create_task', parameters: { title: text(p.title, 200), description: text(p.description, 2000) }, reason: text(a.reason, 500) };
    }),
  };
}
