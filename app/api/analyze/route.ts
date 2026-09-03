import { NextResponse } from "next/server";
import { groqComplete, tavilySearch } from "../../../lib/ai";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";

type Verdict = "BUILD" | "TEST FIRST" | "AVOID";
type Scorecard = { market: number; pain: number; differentiation: number; economics: number; execution: number };
type Confidence = "verified" | "estimate" | "assumption";
type Evidence = { market: Confidence; customer: Confidence; competitors: Confidence; businessModel: Confidence };
type Source = { title: string; url: string; domain: string };
type Intake = { idea: string; customer: string; geography: string; businessModel: string; alternatives: string; constraints: string; outcome: string };
type NextMove = { headline: string; detail: string };
type Analysis = { score: number; scorecard: Scorecard; verdict: Verdict; title: string; summary: string; market: string[]; customer: string[]; problem: string[]; competitors: string[]; gap: string[]; businessModel: string[]; pricing: string; risks: string[]; mvp: string[]; avoid: string[]; firstCustomers: string[]; plan7: string[]; plan30: string[]; assumptions: string[]; sources: Source[]; evidence: Evidence; intake: Intake; nextMove: NextMove; generatedBy: "groq" | "fallback" };

const emptyIntake: Intake = { idea: "", customer: "", geography: "", businessModel: "", alternatives: "", constraints: "", outcome: "" };
const fallbackSources: Source[] = [{ title: "AI-generated directional analysis — no live web verification", url: "", domain: "No source" }, { title: "Founder interviews required for validation", url: "", domain: "No source" }];
const fallbackEvidence: Evidence = { market: "assumption", customer: "assumption", competitors: "assumption", businessModel: "assumption" };

const fallback = (title: string, intake: Intake = emptyIntake): Analysis => ({ score: 74, scorecard: { market: 72, pain: 76, differentiation: 58, economics: 65, execution: 69 }, verdict: "TEST FIRST", title, summary: "The idea contains a potentially valuable customer problem, but its appeal, price sensitivity and differentiation need evidence before a full product investment.", market: ["AI estimate: start with a narrow segment rather than the whole addressable market.", "Validate demand through direct customer conversations before relying on market-size claims."], customer: ["AI estimate: identify one role with a frequent, urgent problem.", "That role should also control (or clearly influence) the budget."], problem: ["Early customers are likely buying a faster, more dependable way to complete an important job.", "Not technology for its own sake — the outcome matters more than the method."], competitors: ["Assumption: existing alternatives include manual work and spreadsheets.", "Agencies and broad software tools are also likely substitutes today."], gap: ["The strongest opening is a narrow audience with a specific, high-frequency problem.", "A result customers can measure beats a longer feature list."], businessModel: ["AI estimate: test a simple subscription or paid pilot.", "Tie the price to a measurable customer outcome, not just access."], pricing: "Assumption: interview customers about current spend before selecting a price.", risks: ["Demand may be weaker than assumed", "Customer acquisition may cost more than expected", "Existing tools may already solve enough of the problem"], mvp: ["One workflow that solves the highest-friction customer job", "A clear before/after outcome", "Manual support behind the scenes where needed", "Measurement for the primary customer result"], avoid: ["Broad platform features", "Premature automation", "Complex permissions", "Anything not required to test willingness to pay"], firstCustomers: ["Interview 10 target customers", "Offer a concierge pilot", "Ask for a paid commitment before building more"], plan7: ["Write one target-customer hypothesis", "Book five interviews", "Create a one-page landing page", "Test a clear offer"], plan30: ["Complete 15 interviews", "Run 3 pilots", "Measure one customer outcome", "Decide whether to build, pivot, or stop"], assumptions: ["The stated problem occurs frequently", "A reachable segment will pay for improvement", "A narrow MVP can create a measurable result"], sources: fallbackSources, evidence: fallbackEvidence, intake, nextMove: { headline: "Get one named prospect to pay before you build more.", detail: "A conversation is not evidence of demand. Ask for a deposit, a signed pilot agreement, or a pre-payment — even a small one — from someone who fits your target customer." }, generatedBy: "fallback" });

function asList(value: unknown, limit = 5) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map(item => item.slice(0, 240)).slice(0, limit) : []; }
function asConfidence(value: unknown, backup: Confidence): Confidence { return value === "verified" || value === "estimate" || value === "assumption" ? value : backup; }

function normalize(value: unknown, title: string, researchSources: Source[], intake: Intake): Analysis {
  const base = fallback(title, intake); const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const verdict: Verdict = raw.verdict === "BUILD" || raw.verdict === "AVOID" || raw.verdict === "TEST FIRST" ? raw.verdict : base.verdict;
  const text = (key: keyof Analysis) => typeof raw[key] === "string" ? (raw[key] as string).slice(0, 900) : base[key] as string;
  const list = (key: string, backup: string[], limit = 5) => { const values = asList(raw[key], limit); return values.length ? values : backup; };
  const rawScorecard = raw.scorecard && typeof raw.scorecard === "object" ? raw.scorecard as Record<string, unknown> : {}; const number = (key: keyof Scorecard) => typeof rawScorecard[key] === "number" ? Math.max(0, Math.min(100, Math.round(rawScorecard[key] as number))) : base.scorecard[key];
  const rawEvidence = raw.evidence && typeof raw.evidence === "object" ? raw.evidence as Record<string, unknown> : {};
  const evidence: Evidence = { market: asConfidence(rawEvidence.market, researchSources.length ? "estimate" : "assumption"), customer: asConfidence(rawEvidence.customer, "assumption"), competitors: asConfidence(rawEvidence.competitors, researchSources.length ? "estimate" : "assumption"), businessModel: asConfidence(rawEvidence.businessModel, "assumption") };
  const rawNextMove = raw.nextMove && typeof raw.nextMove === "object" ? raw.nextMove as Record<string, unknown> : {};
  const nextMove: NextMove = { headline: typeof rawNextMove.headline === "string" && rawNextMove.headline.trim() ? rawNextMove.headline.slice(0, 140) : base.nextMove.headline, detail: typeof rawNextMove.detail === "string" && rawNextMove.detail.trim() ? rawNextMove.detail.slice(0, 400) : base.nextMove.detail };
  return { ...base, score: typeof raw.score === "number" ? Math.max(0, Math.min(100, Math.round(raw.score))) : base.score, scorecard: { market: number("market"), pain: number("pain"), differentiation: number("differentiation"), economics: number("economics"), execution: number("execution") }, verdict, title: typeof raw.title === "string" ? raw.title.slice(0, 72) : title, summary: text("summary"), market: list("market", base.market, 5), customer: list("customer", base.customer, 5), problem: list("problem", base.problem, 5), competitors: list("competitors", base.competitors, 5), gap: list("gap", base.gap, 5), businessModel: list("businessModel", base.businessModel, 5), pricing: text("pricing"), risks: list("risks", base.risks), mvp: list("mvp", base.mvp), avoid: list("avoid", base.avoid), firstCustomers: list("firstCustomers", base.firstCustomers), plan7: list("plan7", base.plan7), plan30: list("plan30", base.plan30), assumptions: list("assumptions", base.assumptions), sources: researchSources.length ? researchSources : fallbackSources, evidence, intake, nextMove, generatedBy: "groq" };
}

function contextBlock(intake: Intake) {
  return [
    `Business idea: ${intake.idea}`,
    intake.customer && `Target customer: ${intake.customer}`,
    intake.geography && `Geography / market: ${intake.geography}`,
    intake.businessModel && `Intended business model: ${intake.businessModel}`,
    intake.alternatives && `Alternatives the founder already knows about: ${intake.alternatives}`,
    intake.constraints && `Founder constraints (time, budget, skills): ${intake.constraints}`,
    intake.outcome && `Desired outcome from this validation pass: ${intake.outcome}`,
  ].filter(Boolean).join("\n");
}

async function generateAnalysis(intake: Intake, title: string): Promise<Analysis> {
  if (!process.env.GROQ_API_KEY) return fallback(title, intake);
  const context = contextBlock(intake);

  // Three targeted, parallel Tavily searches instead of one broad shallow one — each digs into a
  // different angle so the analysis prompt below has enough specific material to work with. If
  // TAVILY_API_KEY is missing, these come back empty and the analysis proceeds ungrounded.
  const [marketPass, customerPass, businessPass] = await Promise.all([
    tavilySearch(`${intake.idea} ${intake.geography} market size competitors alternatives pricing`.trim()),
    tavilySearch(`${intake.customer || intake.idea} problem forum reviews complaints workaround`.trim()),
    tavilySearch(`${intake.idea} ${intake.businessModel} pricing model risks regulation`.trim()),
  ]);

  const seen = new Set<string>();
  const researchSources: Source[] = [...marketPass.sources, ...customerPass.sources, ...businessPass.sources].filter(source => {
    if (seen.has(source.url)) return false;
    seen.add(source.url); return true;
  }).slice(0, 12);

  const combinedResearch = [
    marketPass.text && `MARKET & COMPETITORS RESEARCH:\n${marketPass.text}`,
    customerPass.text && `CUSTOMER LANGUAGE & CURRENT WORKAROUNDS RESEARCH:\n${customerPass.text}`,
    businessPass.text && `PRICING & RISK RESEARCH:\n${businessPass.text}`,
  ].filter(Boolean).join("\n\n") || "No grounded research was returned (TAVILY_API_KEY may be missing, or the searches returned nothing). Treat every finding below as an AI estimate or assumption, not verified.";

  const system = `You are AI Co-Founder, a candid startup intelligence team. Produce a precise, decision-useful JSON brief specific to the stated customer and geography — do not write generic advice that would apply to any idea. Be skeptical; choose AVOID when appropriate. Name concrete alternatives only if present in the research or founder intake. Scorecard values are directional AI estimates, not facts. Never invent facts, named competitors, prices, or citations beyond the research material given to you. Respond with a single JSON object only — no markdown fences, no commentary outside the JSON.

Required JSON shape (all fields required):
{
  "score": integer 0-100,
  "scorecard": {"market": int 0-100, "pain": int 0-100, "differentiation": int 0-100, "economics": int 0-100, "execution": int 0-100},
  "verdict": "BUILD" | "TEST FIRST" | "AVOID",
  "title": string (<=72 chars),
  "summary": string,
  "market": string[], "customer": string[], "problem": string[], "competitors": string[], "gap": string[], "businessModel": string[],
  "pricing": string,
  "risks": string[], "mvp": string[], "avoid": string[], "firstCustomers": string[], "plan7": string[], "plan30": string[], "assumptions": string[],
  "nextMove": {"headline": string, "detail": string},
  "evidence": {"market": "verified"|"estimate"|"assumption", "customer": "verified"|"estimate"|"assumption", "competitors": "verified"|"estimate"|"assumption", "businessModel": "verified"|"estimate"|"assumption"}
}

Write market, customer, problem, competitors, gap, and businessModel as arrays of 2-4 short bullet points each (one sentence per bullet, not a paragraph) — founders scan reports, they don't read prose blocks. Each bullet should carry one specific claim dense with detail from the research (a name, a number, a direct quote) — not a vague generality. If a research pass turned up nothing concrete for a section, say plainly what is unknown in one bullet rather than padding with vague filler across several.

Every price, cost, or monetary figure anywhere in your response — in these bullets, in risks, in nextMove, anywhere — must use the correct currency for the founder's stated geography: ₹ for India, other local currency symbols for other named countries, and $ only when the geography is genuinely global, unspecified, or explicitly US/international. Never default to $ for an Indian or other non-US market.

Ban generic startup-advice filler. Never write bare instructions like "interview 10 customers" or "talk to your target market" with no specifics — every action item in firstCustomers, plan7, and plan30 must name who exactly to contact (the role or channel from the intake), what to ask or offer, and, wherever it fits, a concrete number in the correct local currency: a price to test, a headcount, a days-to-decision window.

"nextMove" is the single most important thing this specific founder should do in the next 7 days to get evidence that someone will actually pay — not just talk. "headline" is one punchy sentence naming the concrete paid ask (a deposit, a pilot fee, a signed LOI, a pre-order) tailored to this idea's customer and price point if one is implied; "detail" is 1-2 sentences on how to ask for it and what a pass/fail result looks like. Do not reuse boilerplate like "talk to 10 customers" — make it specific to this idea.

"evidence" classifies how grounded each of market, customer, competitors, businessModel is: "verified" only if the research directly names a specific supporting fact, "estimate" if it's a reasonable directional judgment without a direct source, "assumption" if it depends entirely on unverified founder input.`;

  const user = `${context}\n\nHere is web research from three separate search passes (market/competitors, customer language, pricing/risk). Use it for specific context, but separate verified findings from AI estimates:\n${combinedResearch}\n\nSix roles collaborate on this brief: Mira (market demand), Asha (customer), Theo (competitors), Owen (business model), Rhea (risks), and Nova (MVP/execution). Return the JSON object now.`;

  const raw = await groqComplete(system, user, { json: true, maxTokens: 3200, temperature: 0.35 });
  return normalize(JSON.parse(raw), title, researchSources, intake);
}

export const maxDuration = 60; // Vercel default is 10s on some plans — 3 parallel Tavily calls + 1 large Groq completion can exceed that and get killed mid-request, which looks identical to any other failure (silent fallback). Raise your plan's function timeout if this still isn't enough.

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clean = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";
  const idea = clean(body?.idea, 2000);
  if (!idea) return NextResponse.json({ error: "Please enter a business idea." }, { status: 400 });
  const intake: Intake = { idea, customer: clean(body?.customer, 300), geography: clean(body?.geography, 200), businessModel: clean(body?.businessModel, 300), alternatives: clean(body?.alternatives, 400), constraints: clean(body?.constraints, 400), outcome: clean(body?.outcome, 300) };
  const title = idea.split(/[.!?]/)[0].slice(0, 72) || "New venture";
  let report = fallback(title, intake); let warning: string | undefined;
  if (!process.env.GROQ_API_KEY) {
    // Distinct from a runtime failure below — this means the key genuinely isn't set on this
    // deployment (or wasn't picked up by the last deploy). Every report will look identical
    // until this is fixed, no matter how good the prompt is.
    warning = "AI analysis is not configured on this deployment yet; showing a directional fallback.";
    console.error("[api/analyze] GROQ_API_KEY is not set — every report will be the static fallback until this is fixed.");
  } else {
    try { report = await generateAnalysis(intake, title); } catch (error) { console.error("[api/analyze] AI generation failed", { message: error instanceof Error ? error.message : "Unknown error" }); warning = "AI analysis is temporarily unavailable; a directional fallback was used."; }
  }
  const reportToSave = warning ? { ...report, warning } : report;
  if (hasSupabaseConfig()) { const supabase = await createClient(); const { data: claims } = await supabase.auth.getClaims(); const userId = claims?.claims?.sub; if (userId) { const { data, error } = await supabase.from("reports").insert({ user_id: userId, idea, title: report.title, verdict: report.verdict, score: report.score, report: reportToSave }).select("id").single(); if (error) warning = "Your report was generated but could not be saved."; else return NextResponse.json({ ...report, id: data.id, saved: true, warning }); } }
  return NextResponse.json({ ...report, saved: false, warning });
}
