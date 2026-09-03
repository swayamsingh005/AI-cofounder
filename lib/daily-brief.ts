import type { SupabaseClient } from "@supabase/supabase-js";
import { groqComplete } from "./ai";
import { loadCompanyContext, formatCompanyContext } from "./company-context";

export type AttentionItem = { severity: "high" | "medium" | "info"; text: string };
export type DailyBrief = { companyName: string; primaryGoalTitle: string | null; primaryGoalProgress: number | null; attentionItems: AttentionItem[]; recommendedPriority: string; generatedBy: "ai" | "template" };

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/** Computed directly from real rows, never from an AI guess — this is what keeps "needs your
 * attention" honest. If nothing here fires, there is genuinely nothing urgent, and the brief says so. */
async function computeAttentionItems(supabase: SupabaseClient, companyId: string, activeMissionId: string | null): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];
  const today = todayDateString();

  const { data: overdue } = await supabase.from("tasks").select("title,due_date").eq("company_id", companyId).lt("due_date", today).neq("status", "completed").limit(3);
  for (const task of overdue ?? []) items.push({ severity: "high", text: `"${task.title}" is overdue (was due ${task.due_date}).` });

  const { data: blocked } = await supabase.from("tasks").select("title").eq("company_id", companyId).eq("status", "blocked").limit(3);
  for (const task of blocked ?? []) items.push({ severity: "high", text: `"${task.title}" is blocked.` });

  const { data: untouchedCritical } = await supabase.from("tasks").select("title").eq("company_id", companyId).eq("priority", "critical").eq("status", "todo").limit(3);
  for (const task of untouchedCritical ?? []) items.push({ severity: "medium", text: `"${task.title}" is critical and hasn't been started yet.` });

  if (!activeMissionId) items.push({ severity: "medium", text: "There's no active mission set for the current goal." });

  return items.slice(0, 5);
}

/** Returns today's cached brief if one exists, otherwise computes and caches a new one. Safe to
 * call on every page load — it only does real work (and only one AI call, if any) once per day
 * per company, per the cost-control principle from the spec. */
export async function getOrCreateDailyBrief(supabase: SupabaseClient, companyId: string, userId: string): Promise<DailyBrief | null> {
  const briefDate = todayDateString();
  const { data: cached } = await supabase.from("daily_briefs").select("recommended_priority,attention_items,generated_by").eq("company_id", companyId).eq("brief_date", briefDate).maybeSingle();

  const ctx = await loadCompanyContext(supabase, companyId);
  if (!ctx) return null;

  if (cached) {
    return {
      companyName: ctx.company.name,
      primaryGoalTitle: ctx.primaryGoal?.title ?? null,
      primaryGoalProgress: ctx.primaryGoal?.progress ?? null,
      attentionItems: Array.isArray(cached.attention_items) ? cached.attention_items : [],
      recommendedPriority: cached.recommended_priority ?? "",
      generatedBy: cached.generated_by === "ai" ? "ai" : "template",
    };
  }

  const attentionItems = await computeAttentionItems(supabase, companyId, ctx.activeMission?.id ?? null);

  let recommendedPriority = "";
  let generatedBy: "ai" | "template" = "template";
  if (!ctx.primaryGoal && !ctx.activeMission) {
    recommendedPriority = "No goal or mission is set yet — ask your Co-Founder to turn your current objective into one.";
  } else if (process.env.GROQ_API_KEY) {
    try {
      const system = `You write one short, direct sentence recommending what a founder should prioritize today, based ONLY on the facts given below — do not invent tasks, metrics, or events not present in the context. If the facts given don't clearly point to one priority, say so plainly rather than guessing. Use the correct local currency for the company's geography if you mention any money (₹ for India, other local symbols for other countries, $ only for global/unspecified/US markets). One or two sentences maximum, plain text, no markdown.`;
      const user = `${formatCompanyContext(ctx)}\n\nToday's flagged items (computed from real data, not guesses):\n${attentionItems.length ? attentionItems.map(i => `- [${i.severity}] ${i.text}`).join("\n") : "None — nothing overdue, blocked, or untouched."}\n\nWrite the one-sentence (or two) recommended priority for today.`;
      recommendedPriority = (await groqComplete(system, user, { maxTokens: 500, temperature: 0.4 })).trim();
      generatedBy = "ai";
    } catch (error) {
      console.error("[lib/daily-brief] AI generation failed", { message: error instanceof Error ? error.message : "Unknown error" });
      recommendedPriority = attentionItems.length ? attentionItems[0].text : "Nothing urgent flagged today — good time to move the active mission forward.";
    }
  } else {
    recommendedPriority = attentionItems.length ? attentionItems[0].text : "Nothing urgent flagged today — good time to move the active mission forward.";
  }

  await supabase.from("daily_briefs").insert({ company_id: companyId, user_id: userId, brief_date: briefDate, recommended_priority: recommendedPriority, attention_items: attentionItems, generated_by: generatedBy });

  return { companyName: ctx.company.name, primaryGoalTitle: ctx.primaryGoal?.title ?? null, primaryGoalProgress: ctx.primaryGoal?.progress ?? null, attentionItems, recommendedPriority, generatedBy };
}
