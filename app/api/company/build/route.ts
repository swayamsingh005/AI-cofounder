import { NextResponse } from "next/server";
import { groqComplete } from "../../../../lib/ai";
import { createClient, hasSupabaseConfig } from "../../../../lib/supabase/server";

type ReportContent = {
  title?: string; summary?: string; problem?: string[]; businessModel?: string[]; gap?: string[];
  risks?: string[]; assumptions?: string[]; nextMove?: { headline?: string };
  intake?: { idea?: string; customer?: string; geography?: string; businessModel?: string; constraints?: string };
};

type PlanTask = { title: string; description: string; priority: "low" | "medium" | "high" | "critical" };
type PlanMilestone = { title: string; tasks: PlanTask[] };
type Plan = { companyName: string; goalTitle: string; goalDescription: string; goalTarget: string; goalDeadlineDays: number; missionObjective: string; missionWhyItMatters: string; missionSuccessCriteria: string; milestones: PlanMilestone[] };

const FALLBACK_PLAN = (ideaTitle: string): Plan => ({
  companyName: ideaTitle.split(" ").slice(0, 3).join(" ") || "New Venture",
  goalTitle: `Validate demand for ${ideaTitle}`,
  goalDescription: "Confirm real customers will pay before investing further in building.",
  goalTarget: "3 customers willing to pay or commit to a pilot",
  goalDeadlineDays: 30,
  missionObjective: "Validate customer demand",
  missionWhyItMatters: "Building without proof of demand is the most common way founders waste months.",
  missionSuccessCriteria: "At least 3 target customers have given a real signal — a paid pilot, a deposit, or a firm commitment.",
  milestones: [
    { title: "Talk to real customers", tasks: [
      { title: "Interview 5 target customers about their current workaround", description: "Ask what they use today, what it costs them, and what would make them switch.", priority: "high" },
      { title: "Document the strongest recurring pain point", description: "Look for a pattern across interviews, not a single anecdote.", priority: "medium" },
    ] },
    { title: "Test willingness to pay", tasks: [
      { title: "Make one concrete paid offer to a real prospect", description: "A deposit, a pilot fee, or a signed intent — not just interest.", priority: "critical" },
    ] },
  ],
});

function asPriority(value: unknown): PlanTask["priority"] {
  return value === "low" || value === "high" || value === "critical" ? value : "medium";
}

function normalizePlan(raw: unknown, ideaTitle: string): Plan {
  const base = FALLBACK_PLAN(ideaTitle);
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const str = (key: string, backup: string) => typeof record[key] === "string" && (record[key] as string).trim() ? (record[key] as string).slice(0, 400) : backup;
  const num = (key: string, backup: number) => typeof record[key] === "number" && record[key] as number > 0 ? Math.round(record[key] as number) : backup;
  const milestonesRaw = Array.isArray(record.milestones) ? record.milestones : [];
  const milestones: PlanMilestone[] = milestonesRaw.slice(0, 5).map((m): PlanMilestone | null => {
    if (!m || typeof m !== "object") return null;
    const mo = m as Record<string, unknown>;
    const title = typeof mo.title === "string" && mo.title.trim() ? mo.title.slice(0, 200) : null;
    if (!title) return null;
    const tasksRaw = Array.isArray(mo.tasks) ? mo.tasks : [];
    const tasks: PlanTask[] = tasksRaw.slice(0, 6).map((t): PlanTask | null => {
      if (!t || typeof t !== "object") return null;
      const to = t as Record<string, unknown>;
      const taskTitle = typeof to.title === "string" && to.title.trim() ? to.title.slice(0, 200) : null;
      if (!taskTitle) return null;
      return { title: taskTitle, description: typeof to.description === "string" ? to.description.slice(0, 400) : "", priority: asPriority(to.priority) };
    }).filter((t): t is PlanTask => t !== null);
    return tasks.length ? { title, tasks } : null;
  }).filter((m): m is PlanMilestone => m !== null);
  return {
    companyName: str("companyName", base.companyName).slice(0, 60),
    goalTitle: str("goalTitle", base.goalTitle), goalDescription: str("goalDescription", base.goalDescription),
    goalTarget: str("goalTarget", base.goalTarget), goalDeadlineDays: num("goalDeadlineDays", base.goalDeadlineDays),
    missionObjective: str("missionObjective", base.missionObjective), missionWhyItMatters: str("missionWhyItMatters", base.missionWhyItMatters),
    missionSuccessCriteria: str("missionSuccessCriteria", base.missionSuccessCriteria),
    milestones: milestones.length ? milestones : base.milestones,
  };
}

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  const { reportId } = await request.json().catch(() => ({}));
  if (typeof reportId !== "string" || !reportId) return NextResponse.json({ error: "A report id is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in to build a company from this report." }, { status: 401 });

  const { data: reportRow, error: reportError } = await supabase.from("reports").select("id,title,idea,report").eq("id", reportId).maybeSingle();
  if (reportError || !reportRow) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const content = (reportRow.report ?? {}) as ReportContent;
  const intake = content.intake ?? {};
  const ideaTitle = reportRow.title || "New venture";

  // Profile fields are mapped directly from the already-generated V1 report — no AI call needed
  // for this part, which keeps the conversion cheap. Only the goal/mission/plan below needs AI.
  // problem/businessModel/gap are bullet arrays in the V1 report (changed from prose paragraphs
  // for readability) — joined into plain sentences here since company_profiles columns are text.
  const profile = {
    description: content.summary ?? null,
    problem: content.problem?.length ? content.problem.join(" ") : null,
    solution: intake.idea ?? reportRow.idea ?? null,
    business_model: content.businessModel?.length ? content.businessModel.join(" ") : null,
    target_customer: intake.customer ?? null,
    target_geography: intake.geography ?? null,
    constraints: intake.constraints ?? null,
    strategy: content.gap?.length ? content.gap.join(" ") : null,
    assumptions: Array.isArray(content.assumptions) ? content.assumptions.slice(0, 8) : [],
    risks: Array.isArray(content.risks) ? content.risks.slice(0, 8) : [],
  };

  let warning: string | undefined;
  let plan = FALLBACK_PLAN(ideaTitle);
  if (!process.env.GROQ_API_KEY) {
    warning = "AI planning is not configured on this deployment yet; a starter plan was used instead.";
  } else {
    try {
      const system = `You turn a validated startup idea into an initial execution plan for a founder. Respond with a single JSON object only, no markdown fences, no commentary outside the JSON, in exactly this shape: {"companyName": string, "goalTitle": string, "goalDescription": string, "goalTarget": string, "goalDeadlineDays": integer, "missionObjective": string, "missionWhyItMatters": string, "missionSuccessCriteria": string, "milestones": [{"title": string, "tasks": [{"title": string, "description": string, "priority": "low"|"medium"|"high"|"critical"}]}]}.

"companyName" is a short, brandable company name (1-3 words) — like a real startup would use, e.g. "Nova" or "LedgerAI" — not a restatement of the idea description. Do not just copy the input title.

The goal should be one measurable, time-bound outcome (e.g. "10 paying customers in 60 days"), not vague. The mission is the single most important thing to focus on right now to reach that goal. Produce 2-4 milestones, each with 2-4 concrete tasks. Tasks must be specific and actionable, not generic ("interview customers" is too vague — "interview 5 dentists about their current booking workflow" is right).

Any price, cost, or monetary figure anywhere in your response (goalTarget, task descriptions, anything) must use the correct currency for the given geography — ₹ for India, other local currency symbols for other named countries, $ only if the geography is genuinely global, unspecified, or explicitly US/international. Do not default to $ for a non-US market.

Do not invent facts not implied by the company context given.`;
      const user = `Idea title: ${ideaTitle}\nWhat it does: ${profile.solution ?? profile.description ?? ""}\nProblem: ${profile.problem ?? "unknown"}\nTarget customer: ${profile.target_customer ?? "unknown"}\nGeography: ${profile.target_geography ?? "unspecified"}\nBusiness model: ${profile.business_model ?? "unknown"}\nFounder constraints: ${profile.constraints ?? "none stated"}\nKey assumptions: ${profile.assumptions.join("; ") || "none stated"}\nKey risks: ${profile.risks.join("; ") || "none stated"}\n\nReturn the JSON object now.`;
      const raw = await groqComplete(system, user, { json: true, maxTokens: 1600, temperature: 0.4 });
      plan = normalizePlan(JSON.parse(raw), ideaTitle);
    } catch (error) {
      console.error("[api/company/build] AI planning failed", { message: error instanceof Error ? error.message : "Unknown error" });
      warning = "AI planning is temporarily unavailable; a starter plan was used instead. You can ask your Co-Founder to refine it once things are working again.";
    }
  }

  const { data: company, error: companyError } = await supabase.from("companies").insert({ user_id: userId, report_id: reportId, name: plan.companyName, stage: "validation" }).select("id").single();
  if (companyError || !company) return NextResponse.json({ error: "Could not create the company." }, { status: 500 });
  const companyId = company.id as string;

  await supabase.from("company_profiles").insert({ company_id: companyId, user_id: userId, ...profile });

  const deadline = new Date(Date.now() + plan.goalDeadlineDays * 86400000).toISOString().slice(0, 10);
  const { data: goal } = await supabase.from("goals").insert({ company_id: companyId, user_id: userId, title: plan.goalTitle, description: plan.goalDescription, target: plan.goalTarget, deadline, is_primary: true }).select("id").single();

  const { data: mission } = await supabase.from("missions").insert({ company_id: companyId, user_id: userId, goal_id: goal?.id ?? null, objective: plan.missionObjective, why_it_matters: plan.missionWhyItMatters, success_criteria: plan.missionSuccessCriteria, is_primary: true }).select("id").single();

  if (mission?.id) {
    for (const [index, milestone] of plan.milestones.entries()) {
      const { data: milestoneRow } = await supabase.from("milestones").insert({ company_id: companyId, user_id: userId, mission_id: mission.id, title: milestone.title, sort_order: index }).select("id").single();
      if (milestoneRow?.id && milestone.tasks.length) {
        await supabase.from("tasks").insert(milestone.tasks.map(task => ({ company_id: companyId, user_id: userId, goal_id: goal?.id ?? null, mission_id: mission.id, milestone_id: milestoneRow.id, title: task.title, description: task.description, priority: task.priority, source: "ai" as const })));
      }
    }
  }

  // A handful of curated memories from the V1 findings — not everything, per spec section 13.
  const memoryRows: { company_id: string; user_id: string; kind: string; title: string; content: string; source: "ai" }[] = [];
  for (const risk of profile.risks.slice(0, 3)) memoryRows.push({ company_id: companyId, user_id: userId, kind: "risk", title: "Risk from V1 research", content: risk, source: "ai" });
  for (const assumption of profile.assumptions.slice(0, 3)) memoryRows.push({ company_id: companyId, user_id: userId, kind: "assumption", title: "Assumption from V1 research", content: assumption, source: "ai" });
  if (content.nextMove?.headline) memoryRows.push({ company_id: companyId, user_id: userId, kind: "strategy", title: "Validation priority", content: content.nextMove.headline, source: "ai" });
  if (memoryRows.length) await supabase.from("memories").insert(memoryRows);

  await supabase.from("activity_events").insert([
    { company_id: companyId, user_id: userId, kind: "company_created", title: `${plan.companyName} was created from a V1 report` },
    { company_id: companyId, user_id: userId, kind: "goal_created", title: `Primary goal set: ${plan.goalTitle}` },
    { company_id: companyId, user_id: userId, kind: "mission_created", title: `Mission started: ${plan.missionObjective}` },
  ]);

  return NextResponse.json({ companyId, warning });
}
