// Company context assembly layer (V2 spec section 25). Deliberately does NOT dump the entire
// company database into every AI call — pulls only what's relevant: profile, primary goal,
// active mission (+ its tasks), recent decisions, recent memories, recent activity. Retrieval is
// plain recency/status-based for now (no embeddings) — the `memories` table is shaped so a
// `embedding vector(N)` column could be added later without a schema rewrite, per spec section 13.

import type { SupabaseClient } from "@supabase/supabase-js";

export type CompanyContext = {
  company: { id: string; name: string; stage: string; industry: string | null };
  profile: {
    description: string | null; problem: string | null; solution: string | null; businessModel: string | null;
    targetCustomer: string | null; targetGeography: string | null; constraints: string | null; strategy: string | null;
    assumptions: string[]; risks: string[];
  } | null;
  primaryGoal: { id: string; title: string; description: string | null; target: string | null; progress: number; status: string } | null;
  activeMission: { id: string; objective: string; whyItMatters: string | null; successCriteria: string | null; progress: number; status: string } | null;
  tasks: { id: string; title: string; status: string; priority: string }[];
  recentDecisions: { id: string; title: string; reasoning: string | null; status: string }[];
  recentMemories: { id: string; kind: string; title: string; content: string }[];
  recentActivity: { kind: string; title: string; createdAt: string }[];
};

/** Fetches everything in parallel, scoped to one company, trusting RLS to enforce ownership —
 * callers must still separately confirm the requesting user owns companyId before calling this
 * (see requireCompanyOwnership) so a stray query never silently returns nothing instead of denying access. */
export async function loadCompanyContext(supabase: SupabaseClient, companyId: string): Promise<CompanyContext | null> {
  const [companyRes, profileRes, goalRes, missionRes, decisionsRes, memoriesRes, activityRes] = await Promise.all([
    supabase.from("companies").select("id,name,stage,industry").eq("id", companyId).maybeSingle(),
    supabase.from("company_profiles").select("*").eq("company_id", companyId).maybeSingle(),
    supabase.from("goals").select("id,title,description,target,progress,status").eq("company_id", companyId).eq("is_primary", true).eq("status", "active").maybeSingle(),
    supabase.from("missions").select("id,objective,why_it_matters,success_criteria,progress,status").eq("company_id", companyId).eq("is_primary", true).eq("status", "active").maybeSingle(),
    supabase.from("decisions").select("id,title,reasoning,status").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5),
    supabase.from("memories").select("id,kind,title,content").eq("company_id", companyId).order("created_at", { ascending: false }).limit(12),
    supabase.from("activity_events").select("kind,title,created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(8),
  ]);
  if (!companyRes.data) return null;

  let tasks: CompanyContext["tasks"] = [];
  if (missionRes.data) {
    const { data } = await supabase.from("tasks").select("id,title,status,priority").eq("mission_id", missionRes.data.id).order("created_at", { ascending: true }).limit(20);
    tasks = data ?? [];
  }

  return {
    company: companyRes.data,
    profile: profileRes.data ? {
      description: profileRes.data.description, problem: profileRes.data.problem, solution: profileRes.data.solution,
      businessModel: profileRes.data.business_model, targetCustomer: profileRes.data.target_customer, targetGeography: profileRes.data.target_geography,
      constraints: profileRes.data.constraints, strategy: profileRes.data.strategy,
      assumptions: Array.isArray(profileRes.data.assumptions) ? profileRes.data.assumptions : [],
      risks: Array.isArray(profileRes.data.risks) ? profileRes.data.risks : [],
    } : null,
    primaryGoal: goalRes.data,
    activeMission: missionRes.data ? { id: missionRes.data.id, objective: missionRes.data.objective, whyItMatters: missionRes.data.why_it_matters, successCriteria: missionRes.data.success_criteria, progress: missionRes.data.progress, status: missionRes.data.status } : null,
    tasks,
    recentDecisions: decisionsRes.data ?? [],
    recentMemories: memoriesRes.data ?? [],
    recentActivity: (activityRes.data ?? []).map(item => ({ kind: item.kind, title: item.title, createdAt: item.created_at })),
  };
}

/** Formats a CompanyContext into a compact text block for a system/user prompt. Kept plain text
 * rather than JSON in the prompt — cheaper in tokens and reads more naturally to the model. */
export function formatCompanyContext(ctx: CompanyContext): string {
  const lines: string[] = [];
  lines.push(`COMPANY: ${ctx.company.name} (stage: ${ctx.company.stage}${ctx.company.industry ? `, industry: ${ctx.company.industry}` : ""})`);
  if (ctx.profile) {
    const p = ctx.profile;
    if (p.description) lines.push(`Description: ${p.description}`);
    if (p.problem) lines.push(`Problem: ${p.problem}`);
    if (p.solution) lines.push(`Solution: ${p.solution}`);
    if (p.targetCustomer) lines.push(`Target customer: ${p.targetCustomer}`);
    if (p.targetGeography) lines.push(`Geography: ${p.targetGeography}`);
    if (p.businessModel) lines.push(`Business model: ${p.businessModel}`);
    if (p.constraints) lines.push(`Founder constraints: ${p.constraints}`);
    if (p.strategy) lines.push(`Strategy: ${p.strategy}`);
    if (p.assumptions.length) lines.push(`Key assumptions: ${p.assumptions.join("; ")}`);
    if (p.risks.length) lines.push(`Key risks: ${p.risks.join("; ")}`);
  }
  if (ctx.primaryGoal) lines.push(`\nPRIMARY GOAL: ${ctx.primaryGoal.title} (${ctx.primaryGoal.progress}% progress, status: ${ctx.primaryGoal.status})${ctx.primaryGoal.target ? ` — target: ${ctx.primaryGoal.target}` : ""}`);
  if (ctx.activeMission) {
    lines.push(`\nACTIVE MISSION: ${ctx.activeMission.objective} (${ctx.activeMission.progress}% progress)`);
    if (ctx.activeMission.whyItMatters) lines.push(`Why it matters: ${ctx.activeMission.whyItMatters}`);
    if (ctx.activeMission.successCriteria) lines.push(`Success criteria: ${ctx.activeMission.successCriteria}`);
  }
  if (ctx.tasks.length) lines.push(`\nCURRENT TASKS:\n${ctx.tasks.map(t => `- [${t.status}/${t.priority}] ${t.title}`).join("\n")}`);
  if (ctx.recentDecisions.length) lines.push(`\nRECENT DECISIONS:\n${ctx.recentDecisions.map(d => `- ${d.title}${d.status !== "active" ? ` (${d.status})` : ""}${d.reasoning ? ` — ${d.reasoning}` : ""}`).join("\n")}`);
  if (ctx.recentMemories.length) lines.push(`\nCOMPANY MEMORY:\n${ctx.recentMemories.map(m => `- [${m.kind}] ${m.title}: ${m.content}`).join("\n")}`);
  if (ctx.recentActivity.length) lines.push(`\nRECENT ACTIVITY: ${ctx.recentActivity.map(a => a.title).join("; ")}`);
  return lines.join("\n");
}
