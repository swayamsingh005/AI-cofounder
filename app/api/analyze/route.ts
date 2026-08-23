import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";

type Verdict = "BUILD" | "TEST FIRST" | "AVOID";
type Scorecard = { market: number; pain: number; differentiation: number; economics: number; execution: number };
type Confidence = "verified" | "estimate" | "assumption";
type Evidence = { market: Confidence; customer: Confidence; competitors: Confidence; businessModel: Confidence };
type Source = { title: string; url: string; domain: string };
type Intake = { idea: string; customer: string; geography: string; businessModel: string; alternatives: string; constraints: string; outcome: string };
type NextMove = { headline: string; detail: string };
type Analysis = { score: number; scorecard: Scorecard; verdict: Verdict; title: string; summary: string; market: string; customer: string; problem: string; competitors: string; gap: string; businessModel: string; pricing: string; risks: string[]; mvp: string[]; avoid: string[]; firstCustomers: string[]; plan7: string[]; plan30: string[]; assumptions: string[]; sources: Source[]; evidence: Evidence; intake: Intake; nextMove: NextMove; generatedBy: "gemini" | "fallback" };

const emptyIntake: Intake = { idea: "", customer: "", geography: "", businessModel: "", alternatives: "", constraints: "", outcome: "" };
const fallbackSources: Source[] = [{ title: "AI-generated directional analysis — no live web verification", url: "", domain: "No source" }, { title: "Founder interviews required for validation", url: "", domain: "No source" }];
const fallbackEvidence: Evidence = { market: "assumption", customer: "assumption", competitors: "assumption", businessModel: "assumption" };

const fallback = (title: string, intake: Intake = emptyIntake): Analysis => ({ score: 74, scorecard: { market: 72, pain: 76, differentiation: 58, economics: 65, execution: 69 }, verdict: "TEST FIRST", title, summary: "The idea contains a potentially valuable customer problem, but its appeal, price sensitivity and differentiation need evidence before a full product investment.", market: "AI estimate: start with a narrow segment and validate demand through customer conversations before relying on market-size claims.", customer: "AI estimate: identify one role with a frequent, urgent problem and a clear budget owner.", problem: "Early customers are likely buying a faster, more dependable way to complete an important job—not technology for its own sake.", competitors: "Assumption: existing alternatives include manual work, spreadsheets, agencies, and broad software tools.", gap: "The strongest opening is a narrow audience, a specific high-frequency problem and a result that customers can measure.", businessModel: "AI estimate: test a simple subscription or paid pilot tied to a measurable customer outcome.", pricing: "Assumption: interview customers about current spend before selecting a price.", risks: ["Demand may be weaker than assumed", "Customer acquisition may cost more than expected", "Existing tools may already solve enough of the problem"], mvp: ["One workflow that solves the highest-friction customer job", "A clear before/after outcome", "Manual support behind the scenes where needed", "Measurement for the primary customer result"], avoid: ["Broad platform features", "Premature automation", "Complex permissions", "Anything not required to test willingness to pay"], firstCustomers: ["Interview 10 target customers", "Offer a concierge pilot", "Ask for a paid commitment before building more"], plan7: ["Write one target-customer hypothesis", "Book five interviews", "Create a one-page landing page", "Test a clear offer"], plan30: ["Complete 15 interviews", "Run 3 pilots", "Measure one customer outcome", "Decide whether to build, pivot, or stop"], assumptions: ["The stated problem occurs frequently", "A reachable segment will pay for improvement", "A narrow MVP can create a measurable result"], sources: fallbackSources, evidence: fallbackEvidence, intake, nextMove: { headline: "Get one named prospect to pay before you build more.", detail: "A conversation is not evidence of demand. Ask for a deposit, a signed pilot agreement, or a pre-payment — even a small one — from someone who fits your target customer." }, generatedBy: "fallback" });

function asList(value: unknown, limit = 5) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map(item => item.slice(0, 240)).slice(0, limit) : []; }
function asConfidence(value: unknown, backup: Confidence): Confidence { return value === "verified" || value === "estimate" || value === "assumption" ? value : backup; }

function normalize(value: unknown, title: string, researchSources: Source[], intake: Intake): Analysis {
  const base = fallback(title, intake); const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const verdict: Verdict = raw.verdict === "BUILD" || raw.verdict === "AVOID" || raw.verdict === "TEST FIRST" ? raw.verdict : base.verdict;
  const text = (key: keyof Analysis) => typeof raw[key] === "string" ? (raw[key] as string).slice(0, 900) : base[key] as string;
  const list = (key: string, backup: string[]) => { const values = asList(raw[key]); return values.length ? values : backup; };
  const rawScorecard = raw.scorecard && typeof raw.scorecard === "object" ? raw.scorecard as Record<string, unknown> : {}; const number = (key: keyof Scorecard) => typeof rawScorecard[key] === "number" ? Math.max(0, Math.min(100, Math.round(rawScorecard[key] as number))) : base.scorecard[key];
  const rawEvidence = raw.evidence && typeof raw.evidence === "object" ? raw.evidence as Record<string, unknown> : {};
  const evidence: Evidence = { market: asConfidence(rawEvidence.market, researchSources.length ? "estimate" : "assumption"), customer: asConfidence(rawEvidence.customer, "assumption"), competitors: asConfidence(rawEvidence.competitors, researchSources.length ? "estimate" : "assumption"), businessModel: asConfidence(rawEvidence.businessModel, "assumption") };
  const rawNextMove = raw.nextMove && typeof raw.nextMove === "object" ? raw.nextMove as Record<string, unknown> : {};
  const nextMove: NextMove = { headline: typeof rawNextMove.headline === "string" && rawNextMove.headline.trim() ? rawNextMove.headline.slice(0, 140) : base.nextMove.headline, detail: typeof rawNextMove.detail === "string" && rawNextMove.detail.trim() ? rawNextMove.detail.slice(0, 400) : base.nextMove.detail };
  return { ...base, score: typeof raw.score === "number" ? Math.max(0, Math.min(100, Math.round(raw.score))) : base.score, scorecard: { market: number("market"), pain: number("pain"), differentiation: number("differentiation"), economics: number("economics"), execution: number("execution") }, verdict, title: typeof raw.title === "string" ? raw.title.slice(0, 72) : title, summary: text("summary"), market: text("market"), customer: text("customer"), problem: text("problem"), competitors: text("competitors"), gap: text("gap"), businessModel: text("businessModel"), pricing: text("pricing"), risks: list("risks", base.risks), mvp: list("mvp", base.mvp), avoid: list("avoid", base.avoid), firstCustomers: list("firstCustomers", base.firstCustomers), plan7: list("plan7", base.plan7), plan30: list("plan30", base.plan30), assumptions: list("assumptions", base.assumptions), sources: researchSources.length ? researchSources : fallbackSources, evidence, intake, nextMove, generatedBy: "gemini" };
}

function domainOf(url: string) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.slice(0, 40); } }

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

async function groundedSearch(ai: GoogleGenAI, contents: string): Promise<{ text: string; sources: Source[] }> {
  const research = await ai.models.generateContent({ model: "gemini-3.5-flash-lite", contents, config: { tools: [{ googleSearch: {} }], maxOutputTokens: 1100, temperature: 0.3 } as never });
  const metadata = (research.candidates?.[0] as unknown as { groundingMetadata?: { groundingChunks?: Array<{ web?: { title?: string; uri?: string } }> } } | undefined)?.groundingMetadata;
  const sources: Source[] = (metadata?.groundingChunks ?? []).flatMap(chunk => {
    const uri = chunk.web?.uri; if (!uri) return [];
    return [{ title: chunk.web?.title ?? "Web source", url: uri, domain: domainOf(uri) }];
  });
  return { text: research.text ?? "", sources };
}

async function generateAnalysis(intake: Intake, title: string): Promise<Analysis> {
  if (!process.env.GEMINI_API_KEY) return fallback(title, intake);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const context = contextBlock(intake);

  // Three targeted, parallel research passes instead of one broad shallow one — each digs into a
  // different angle so the analysis prompt below has enough specific material to work with.
  const [marketPass, customerPass, businessPass] = await Promise.all([
    groundedSearch(ai, `Research the market and competitive landscape for this idea using current public web sources.\n${context}\n\nFind: (1) named, currently operating alternatives or competitors — actual product/company names, not categories — and what each one does; (2) any pricing you can find for those alternatives; (3) market size, growth rate, or adoption trend signals specific to this space and geography. Cite specifics (numbers, names, dates) wherever the sources support them. If you find nothing concrete on a point, say so plainly instead of guessing.`),
    groundedSearch(ai, `Research how the target customer described below actually talks about this problem, using current public web sources (forums, reviews, communities, articles, complaints).\n${context}\n\nFind: (1) direct or paraphrased language this customer uses to describe the pain, in their own words if possible; (2) what workaround or tool they currently use instead; (3) any evidence of what they already pay for adjacent solutions. If nothing specific turns up, say so rather than inventing a persona.`),
    groundedSearch(ai, `Research pricing norms, willingness-to-pay signals, and material risks for this idea using current public web sources.\n${context}\n\nFind: (1) typical pricing models or price points for comparable products in this space; (2) any regulatory, legal, technical, or trust-related risk specific to this idea or geography; (3) signs of how hard or easy customer acquisition tends to be in this space. Be specific about numbers and sources where they exist.`),
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
  ].filter(Boolean).join("\n\n") || "No grounded research was returned by any of the three research passes.";

  const prompt = `You are AI Co-Founder, a candid startup intelligence team. Analyze this business idea using the founder's full intake below, not just the one-line idea.\n\n${context}\n\nHere is grounded web research from three separate research passes (market/competitors, customer language, pricing/risk). Use it for specific context, but separate verified findings from AI estimates. Do not invent facts, named competitors, prices, or citations beyond this material:\n${combinedResearch}\n\nSix roles collaborate: Mira (market demand), Asha (customer), Theo (competitors), Owen (business model), Rhea (risks), and Nova (MVP/execution). Produce a precise, decision-useful JSON brief specific to the stated customer and geography — do not write generic advice that would apply to any idea. Be skeptical; choose AVOID when appropriate. Name concrete alternatives only if present in the research or founder intake. Scorecard values are directional AI estimates, not facts. Provide validation actions that would change the verdict. Score 0-100 and verdict BUILD, TEST FIRST, or AVOID.\n\nWrite market, customer, problem, competitors, gap, and businessModel as 3-5 sentences each, dense with specifics pulled from the research above (names, numbers, direct language) — not one-line generalities. If a research pass turned up nothing concrete for a section, say plainly what is unknown rather than padding with vague filler.\n\nBan generic startup-advice filler. Never write bare instructions like "interview 10 customers" or "talk to your target market" with no specifics — every action item in firstCustomers, plan7, and plan30 must name who exactly to contact (the role or channel from the intake), what to ask or offer, and, wherever it fits, a concrete number: a price to test, a headcount, a days-to-decision window. Prefer "ask a $200/month pilot fee" over "validate pricing."\n\nAlso produce a "nextMove" object: the single most important thing this specific founder should do in the next 7 days to get evidence that someone will actually pay — not just talk. "headline" is one punchy sentence naming the concrete paid ask (a deposit, a pilot fee, a signed LOI, a pre-order) tailored to this idea's customer and price point if one is implied; "detail" is 1-2 sentences on how to ask for it and what a pass/fail result looks like. Do not reuse boilerplate like "talk to 10 customers" — make it specific to this idea.\n\nAlso return an "evidence" object classifying how grounded each of market, customer, competitors, businessModel is: "verified" only if the grounded research directly names a specific supporting fact, "estimate" if it is a reasonable directional judgment without a direct source, "assumption" if it depends entirely on unverified founder input.`;
  const schema = { type: "object", properties: { score: { type: "integer" }, scorecard: { type: "object", properties: { market: { type: "integer" }, pain: { type: "integer" }, differentiation: { type: "integer" }, economics: { type: "integer" }, execution: { type: "integer" } }, required: ["market", "pain", "differentiation", "economics", "execution"], additionalProperties: false }, verdict: { type: "string", enum: ["BUILD", "TEST FIRST", "AVOID"] }, title: { type: "string" }, summary: { type: "string" }, market: { type: "string" }, customer: { type: "string" }, problem: { type: "string" }, competitors: { type: "string" }, gap: { type: "string" }, businessModel: { type: "string" }, pricing: { type: "string" }, risks: { type: "array", items: { type: "string" } }, mvp: { type: "array", items: { type: "string" } }, avoid: { type: "array", items: { type: "string" } }, firstCustomers: { type: "array", items: { type: "string" } }, plan7: { type: "array", items: { type: "string" } }, plan30: { type: "array", items: { type: "string" } }, assumptions: { type: "array", items: { type: "string" } }, nextMove: { type: "object", properties: { headline: { type: "string" }, detail: { type: "string" } }, required: ["headline", "detail"], additionalProperties: false }, evidence: { type: "object", properties: { market: { type: "string", enum: ["verified", "estimate", "assumption"] }, customer: { type: "string", enum: ["verified", "estimate", "assumption"] }, competitors: { type: "string", enum: ["verified", "estimate", "assumption"] }, businessModel: { type: "string", enum: ["verified", "estimate", "assumption"] } }, required: ["market", "customer", "competitors", "businessModel"], additionalProperties: false } }, required: ["score", "scorecard", "verdict", "title", "summary", "market", "customer", "problem", "competitors", "gap", "businessModel", "pricing", "risks", "mvp", "avoid", "firstCustomers", "plan7", "plan30", "assumptions", "nextMove", "evidence"], additionalProperties: false };
  const response = await ai.models.generateContent({ model: "gemini-3.5-flash-lite", contents: prompt, config: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: 3200, temperature: 0.35 } });
  if (!response.text) throw new Error("Gemini returned an empty response");
  return normalize(JSON.parse(response.text), title, researchSources, intake);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const clean = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";
  const idea = clean(body?.idea, 2000);
  if (!idea) return NextResponse.json({ error: "Please enter a business idea." }, { status: 400 });
  const intake: Intake = { idea, customer: clean(body?.customer, 300), geography: clean(body?.geography, 200), businessModel: clean(body?.businessModel, 300), alternatives: clean(body?.alternatives, 400), constraints: clean(body?.constraints, 400), outcome: clean(body?.outcome, 300) };
  const title = idea.split(/[.!?]/)[0].slice(0, 72) || "New venture";
  let report = fallback(title, intake); let warning: string | undefined;
  try { report = await generateAnalysis(intake, title); } catch (error) { console.error("[api/analyze] Gemini generation failed", { message: error instanceof Error ? error.message : "Unknown error" }); warning = "AI analysis is temporarily unavailable; a directional fallback was used."; }
  if (hasSupabaseConfig()) { const supabase = await createClient(); const { data: claims } = await supabase.auth.getClaims(); const userId = claims?.claims?.sub; if (userId) { const { data, error } = await supabase.from("reports").insert({ user_id: userId, idea, title: report.title, verdict: report.verdict, score: report.score, report }).select("id").single(); if (error) warning = "Your report was generated but could not be saved."; else return NextResponse.json({ ...report, id: data.id, saved: true, warning }); } }
  return NextResponse.json({ ...report, saved: false, warning });
}
