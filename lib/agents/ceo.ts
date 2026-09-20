import type { AgentId } from './registry';

export type CeoAssignment = { agentId: AgentId; reason: string; sequence: number };
export type CeoPlan = {
  businessType: string;
  primaryObjective: string;
  needsSoftware: boolean;
  selectedAgents: CeoAssignment[];
  excludedAgents: { agentId: AgentId; reason: string }[];
  rationale: string;
};

const ALL_AGENTS: AgentId[] = ['research', 'coding', 'marketing'];
const SOFTWARE = /\b(app|website|web app|saas|software|platform|api|dashboard|portal|marketplace|mobile|automation|code|github|database|auth|bug|deploy)\b/i;
const RESEARCH = /\b(research|validate|market|customer|competitor|demand|evidence|industry|feasibility|unknown)\b/i;
const MARKETING = /\b(marketing|campaign|content|social|reel|post|brand|audience|positioning|launch|promotion|sales|lead)\b/i;

const reason: Record<AgentId, string> = {
  research: 'Validate the market, customer need and important unknowns with evidence.',
  coding: 'Design or build the software required to deliver the product.',
  marketing: 'Define positioning, acquisition and content needed to reach customers.',
};

export function fallbackCeoPlan(input: string, primaryObjective = 'Validate the idea and choose the next evidence-based action.'): CeoPlan {
  const text = input.trim();
  const needsSoftware = SOFTWARE.test(text);
  const chosen = new Set<AgentId>();
  if (RESEARCH.test(text) || (!needsSoftware && (!MARKETING.test(text) || /\blaunch\b/i.test(text)))) chosen.add('research');
  if (needsSoftware) chosen.add('coding');
  if (MARKETING.test(text)) chosen.add('marketing');
  if (!chosen.size) chosen.add('research');
  const selectedAgents = ALL_AGENTS.filter(agentId => chosen.has(agentId)).map((agentId, index) => ({ agentId, reason: reason[agentId], sequence: index + 1 }));
  const excludedAgents = ALL_AGENTS.filter(agentId => !chosen.has(agentId)).map(agentId => ({ agentId, reason: agentId === 'coding' ? 'No software requirement has been established yet.' : `The current objective does not require ${agentId} work yet.` }));
  return {
    businessType: needsSoftware ? 'Software-enabled business' : 'Non-software or not yet classified',
    primaryObjective,
    needsSoftware,
    selectedAgents,
    excludedAgents,
    rationale: needsSoftware ? 'Software appears necessary for the stated product, so technical work follows evidence gathering where needed.' : 'The stated idea does not establish a software need, so the CEO will not assign Coding by default.',
  };
}

export function normalizeCeoPlan(value: unknown, input: string): CeoPlan {
  const base = fallbackCeoPlan(input);
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const needsSoftware = typeof raw.needsSoftware === 'boolean' ? raw.needsSoftware : base.needsSoftware;
  const rawSelected = Array.isArray(raw.selectedAgents) ? raw.selectedAgents : [];
  const selected: CeoAssignment[] = [];
  for (const item of rawSelected) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const agentId = row.agentId;
    if (!ALL_AGENTS.includes(agentId as AgentId) || selected.some(entry => entry.agentId === agentId)) continue;
    if (agentId === 'coding' && !needsSoftware) continue;
    selected.push({ agentId: agentId as AgentId, reason: typeof row.reason === 'string' ? row.reason.slice(0, 240) : reason[agentId as AgentId], sequence: selected.length + 1 });
  }
  if (!selected.length) return fallbackCeoPlan(input, typeof raw.primaryObjective === 'string' ? raw.primaryObjective.slice(0, 240) : base.primaryObjective);
  const selectedIds = new Set(selected.map(item => item.agentId));
  return {
    businessType: typeof raw.businessType === 'string' ? raw.businessType.slice(0, 120) : base.businessType,
    primaryObjective: typeof raw.primaryObjective === 'string' ? raw.primaryObjective.slice(0, 240) : base.primaryObjective,
    needsSoftware,
    selectedAgents: selected,
    excludedAgents: ALL_AGENTS.filter(agentId => !selectedIds.has(agentId)).map(agentId => ({ agentId, reason: agentId === 'coding' && !needsSoftware ? 'No software requirement has been established yet.' : `The CEO has deferred ${agentId} work for this stage.` })),
    rationale: typeof raw.rationale === 'string' ? raw.rationale.slice(0, 500) : base.rationale,
  };
}
