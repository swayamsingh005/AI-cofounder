import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanyContext } from "./company-context";
import { ATTENTION_TYPES, type AttentionType } from './intelligence/event-types';

export type AttentionItem = { type?: AttentionType; severity: "high" | "medium" | "info"; text: string; taskId: string | null };
export type NextBestAction = { title: string; reason: string; taskId: string | null };
export type DailyBrief = { companyName: string; primaryGoalTitle: string | null; primaryGoalProgress: number | null; attentionItems: AttentionItem[]; nextBestAction: NextBestAction; generatedBy: "template" };

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

const SEVERITY_ORDER: Record<AttentionItem["severity"], number> = { high: 0, medium: 1, info: 2 };

/** Computed directly from real rows, never from an AI guess — this is what keeps "needs your
 * attention" honest. If nothing here fires, there is genuinely nothing urgent, and the brief says
 * so, per the spec's explicit "do not fabricate warnings simply to fill the interface." No AI call
 * anywhere in this file: every reason below follows directly and unambiguously from the signal
 * type itself (overdue, blocked, critical-and-untouched), so a model call would add cost and a
 * new failure mode without adding real clarity. */
async function computeAttentionItems(supabase: SupabaseClient, companyId: string, activeMissionId: string | null): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];
  const today = todayDateString();

  const { data: overdue } = await supabase.from("tasks").select("id,title,due_date").eq("company_id", companyId).lt("due_date", today).neq("status", "completed").limit(3);
  for (const task of overdue ?? []) items.push({ type: ATTENTION_TYPES.overdue, severity: "high", text: `"${task.title}" is overdue — was due ${task.due_date}.`, taskId: task.id });

  const { data: blocked } = await supabase.from("tasks").select("id,title").eq("company_id", companyId).eq("status", "blocked").limit(3);
  for (const task of blocked ?? []) items.push({ type: ATTENTION_TYPES.blocked, severity: "high", text: `"${task.title}" is blocked.`, taskId: task.id });

  const { data: untouchedCritical } = await supabase.from("tasks").select("id,title").eq("company_id", companyId).eq("priority", "critical").eq("status", "todo").limit(3);
  for (const task of untouchedCritical ?? []) items.push({ type: ATTENTION_TYPES.critical, severity: "medium", text: `"${task.title}" is critical and hasn't been started yet.`, taskId: task.id });

  if (!activeMissionId) items.push({ type: ATTENTION_TYPES.noMission, severity: "medium", text: "There's no active mission set for the current goal.", taskId: null });

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]).slice(0, 6);
}

function reasonFor(item: AttentionItem): string {
  if (item.type === ATTENTION_TYPES.overdue) return "This is the most time-sensitive item outstanding right now.";
  if (item.type === ATTENTION_TYPES.blocked) return "Progress on this is stuck until it's resolved.";
  if (item.type === ATTENTION_TYPES.critical) return "This task is marked critical. Confirm its dependencies and relevance to your current stage before starting.";
  if (item.type === ATTENTION_TYPES.insight) return "Review the recorded evidence and unknowns before choosing an action.";
  if (item.type === ATTENTION_TYPES.approval) return "Review the proposed action before approving it.";
  if (item.type === ATTENTION_TYPES.execution) return "Review the recorded execution results; business impact has not been measured.";
  return "This needs a decision before the mission can move forward.";
}

/** Falls back to the next actionable todo task in the active mission (highest priority first)
 * when nothing is actually flagged as urgent — "keep momentum" framing, not a fabricated warning. */
async function fallbackNextAction(supabase: SupabaseClient, activeMissionId: string): Promise<NextBestAction | null> {
  const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const { data: tasks } = await supabase.from("tasks").select("id,title,priority").eq("mission_id", activeMissionId).eq("status", "todo").limit(10);
  if (!tasks?.length) return null;
  const next = [...tasks].sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9))[0];
  return { title: next.title, reason: "Nothing urgent is flagged today — moving this forward keeps the mission on track.", taskId: next.id };
}

/** Compute a deterministic snapshot for explicit generation. Reads reuse the saved daily snapshot. */
async function computeDailyBrief(supabase: SupabaseClient, companyId: string): Promise<DailyBrief | null> {
  const ctx = await loadCompanyContext(supabase, companyId);
  if (!ctx) return null;


  let attentionItems = await computeAttentionItems(supabase, companyId, ctx.activeMission?.id ?? null);
  const [insights, approvals, executions] = await Promise.all([
    supabase.from('company_insights').select('id,title,severity').eq('company_id',companyId).in('status',['new','investigating']).eq('severity','high').limit(2),
    supabase.from('ai_actions').select('id,title').eq('company_id',companyId).eq('status','awaiting_approval').limit(2),
    supabase.from('ai_actions').select('id', {count:'exact',head:true}).eq('company_id',companyId).eq('status','completed').gte('executed_at',new Date(Date.now()-86400000).toISOString()),
  ]);
  for(const insight of insights.data??[]) attentionItems.unshift({type:ATTENTION_TYPES.insight,severity:'high',text:`Review insight: ${insight.title}`,taskId:null});
  for(const action of approvals.data??[]) attentionItems.push({type:ATTENTION_TYPES.approval,severity:'medium',text:`Approval waiting: ${action.title}`,taskId:null});
  if(executions.count) attentionItems.push({type:ATTENTION_TYPES.execution,severity:'info',text:`${executions.count} actions completed in the last 24 hours. Review Execution History for actual results.`,taskId:null});
  let nextBestAction: NextBestAction;

  if (attentionItems.length > 0) {
    const top = attentionItems[0];
    nextBestAction = { title: top.text.replace(/^"(.*)".*$/, "$1"), reason: reasonFor(top), taskId: top.taskId };
    attentionItems = attentionItems.slice(1); // don't show the same item twice — it's already the headline action
  } else if (ctx.activeMission) {
    const fallback = await fallbackNextAction(supabase, ctx.activeMission.id);
    nextBestAction = fallback ?? { title: "Everything in the active mission is either done or in progress.", reason: "Ask your Co-Founder what to tackle next.", taskId: null };
  } else if (ctx.primaryGoal) {
    nextBestAction = { title: "No active mission is set for the current goal.", reason: "Ask your Co-Founder to turn the goal into a mission with concrete tasks.", taskId: null };
  } else {
    nextBestAction = { title: "No goal or mission is set yet.", reason: "Ask your Co-Founder to turn your current objective into one.", taskId: null };
  }

  return { companyName: ctx.company.name, primaryGoalTitle: ctx.primaryGoal?.title ?? null, primaryGoalProgress: ctx.primaryGoal?.progress ?? null, attentionItems, nextBestAction, generatedBy: "template" };
}

/** Read-only dashboard access. A missing brief is generated by the explicit refresh action. */
export async function getDailyBrief(supabase: SupabaseClient, companyId: string): Promise<DailyBrief | null> {
  const [ctx, saved] = await Promise.all([
    loadCompanyContext(supabase, companyId),
    Promise.resolve(supabase.from('daily_briefs').select('attention_items,next_best_action').eq('company_id',companyId).eq('brief_date',todayDateString()).maybeSingle()).catch(() => ({ data: null, error: true })),
  ]);
  if (!ctx || saved.error || !saved.data?.next_best_action) return null;
  return {companyName:ctx.company.name,primaryGoalTitle:ctx.primaryGoal?.title??null,primaryGoalProgress:ctx.primaryGoal?.progress??null,attentionItems:saved.data.attention_items,nextBestAction:saved.data.next_best_action,generatedBy:'template'};
}

/** Unique daily key and DO NOTHING semantics prevent concurrent refreshes from rewriting it. */
export async function generateDailyBrief(supabase: SupabaseClient, companyId: string, userId: string): Promise<DailyBrief | null> {
  const existing = await getDailyBrief(supabase,companyId);
  if (existing) return existing;
  const brief = await computeDailyBrief(supabase,companyId);
  if (!brief) return null;
  const result = await supabase.from('daily_briefs').upsert({company_id:companyId,user_id:userId,brief_date:todayDateString(),recommended_priority:brief.nextBestAction.title,attention_items:brief.attentionItems,next_best_action:brief.nextBestAction,generated_by:'template'},{onConflict:'company_id,brief_date',ignoreDuplicates:true});
  if (result.error) throw new Error('Daily brief could not be saved. Retry the refresh.');
  return getDailyBrief(supabase,companyId);
}
