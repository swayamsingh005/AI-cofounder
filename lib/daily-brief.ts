import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanyContext } from "./company-context";

export type AttentionItem = { severity: "high" | "medium" | "info"; text: string; taskId: string | null };
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
  for (const task of overdue ?? []) items.push({ severity: "high", text: `"${task.title}" is overdue — was due ${task.due_date}.`, taskId: task.id });

  const { data: blocked } = await supabase.from("tasks").select("id,title").eq("company_id", companyId).eq("status", "blocked").limit(3);
  for (const task of blocked ?? []) items.push({ severity: "high", text: `"${task.title}" is blocked.`, taskId: task.id });

  const { data: untouchedCritical } = await supabase.from("tasks").select("id,title").eq("company_id", companyId).eq("priority", "critical").eq("status", "todo").limit(3);
  for (const task of untouchedCritical ?? []) items.push({ severity: "medium", text: `"${task.title}" is critical and hasn't been started yet.`, taskId: task.id });

  if (!activeMissionId) items.push({ severity: "medium", text: "There's no active mission set for the current goal.", taskId: null });

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]).slice(0, 6);
}

function reasonFor(item: AttentionItem): string {
  if (item.text.includes("overdue")) return "This is the most time-sensitive item outstanding right now.";
  if (item.text.includes("blocked")) return "Progress on this is stuck until it's resolved.";
  if (item.text.includes("critical")) return "It's marked critical and likely gates other work in the mission.";
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

/** Returns today's cached brief if one exists, otherwise computes and caches a new one. Purely
 * deterministic (see computeAttentionItems) — safe and cheap to call on every page load, no AI
 * cost regardless of caching, but still cached per calendar day so the "today's brief" framing
 * stays stable across visits rather than recomputing (and potentially reordering) on every load. */
export async function getOrCreateDailyBrief(supabase: SupabaseClient, companyId: string, userId: string): Promise<DailyBrief | null> {
  const briefDate = todayDateString();
  const { data: cached } = await supabase.from("daily_briefs").select("recommended_priority,attention_items,next_best_action").eq("company_id", companyId).eq("brief_date", briefDate).maybeSingle();

  const ctx = await loadCompanyContext(supabase, companyId);
  if (!ctx) return null;

  if (cached?.next_best_action) {
    return {
      companyName: ctx.company.name,
      primaryGoalTitle: ctx.primaryGoal?.title ?? null,
      primaryGoalProgress: ctx.primaryGoal?.progress ?? null,
      attentionItems: Array.isArray(cached.attention_items) ? cached.attention_items : [],
      nextBestAction: cached.next_best_action as NextBestAction,
      generatedBy: "template",
    };
  }

  let attentionItems = await computeAttentionItems(supabase, companyId, ctx.activeMission?.id ?? null);
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

  await supabase.from("daily_briefs").insert({ company_id: companyId, user_id: userId, brief_date: briefDate, recommended_priority: nextBestAction.title, attention_items: attentionItems, next_best_action: nextBestAction, generated_by: "template" });

  return { companyName: ctx.company.name, primaryGoalTitle: ctx.primaryGoal?.title ?? null, primaryGoalProgress: ctx.primaryGoal?.progress ?? null, attentionItems, nextBestAction, generatedBy: "template" };
}
