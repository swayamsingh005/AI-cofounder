import { parsePlan, text, type Step } from './schema';
import { fallbackCeoPlan } from './ceo';

// Deliberately bounded routing: no recursive planning and no model call just to choose a tool.
export function planGoal(goal: string, maxSteps = 3): Step[] {
  const objective = text(goal, 500);
  const decision = fallbackCeoPlan(goal, objective);
  const selected = new Set(decision.selectedAgents.map(item => item.agentId));
  const research = selected.has('research');
  const coding = selected.has('coding');
  const marketing = selected.has('marketing');
  const steps: Step[] = [];
  if (research) steps.push({ agentId: 'research', objective, actionType: 'analyze_context', dependsOn: [] });
  if (coding) steps.push({ agentId: 'coding', objective, actionType: /github|issues/i.test(goal) ? 'analyze_github_issues' : 'analyze_context', dependsOn: steps.map((_, i) => i) });
  if (marketing) steps.push({ agentId: 'marketing', objective, actionType: 'analyze_context', dependsOn: steps.map((_, i) => i) });
  return parsePlan({ steps }, maxSteps);
}

export function limits(env: Record<string, string | undefined> = process.env) {
  const bounded = (key: string, fallback: number, max: number, min = 1) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid agent limit: ' + key);
    return value;
  };
  return {
    maxSteps: bounded('AGENT_MAX_STEPS', 3, 3),
    maxActions: bounded('AGENT_MAX_ACTIONS', 2, 2, 0),
    timeoutMs: bounded('AGENT_TIMEOUT_MS', 12000, 15000, 1000),
    maxTokens: bounded('AGENT_MAX_OUTPUT_TOKENS', 1400, 2000, 100),
    maxRetries: 0,
  };
}
