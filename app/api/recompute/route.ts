import { NextResponse } from "next/server";
import { groqComplete } from "../../../lib/ai";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";

type Memory = { kind: string; title: string; content: string; created_at: string };
type Verdict = "BUILD" | "TEST FIRST" | "AVOID";
type RecomputeResult = { score: number; verdict: Verdict; changed: boolean; evidenceSummary: string; reasoning: string; repeatedSignals: string[] };

function asVerdict(value: unknown, backup: Verdict): Verdict { return value === "BUILD" || value === "AVOID" || value === "TEST FIRST" ? value : backup; }

function normalizeRecompute(raw: unknown, backup: Verdict, backupScore: number): RecomputeResult {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const score = typeof record.score === "number" && Number.isFinite(record.score) ? Math.max(0, Math.min(100, Math.round(record.score))) : backupScore;
  const verdict = asVerdict(record.verdict, backup);
  const evidenceSummary = typeof record.evidenceSummary === "string" && record.evidenceSummary.trim() ? record.evidenceSummary.slice(0, 900) : "The model did not return a clear evidence summary.";
  const reasoning = typeof record.reasoning === "string" ? record.reasoning.slice(0, 900) : "";
  const repeatedSignals = Array.isArray(record.repeatedSignals) ? record.repeatedSignals.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
  return { score, verdict, changed: verdict !== backup || score !== backupScore, evidenceSummary, reasoning, repeatedSignals };
}

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  const { reportId } = await request.json().catch(() => ({}));
  if (typeof reportId !== "string" || !reportId) return NextResponse.json({ error: "A report id is required." }, { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in to recompute a report." }, { status: 401 });

  const { data: reportRow, error: reportError } = await supabase.from("reports").select("id,idea,title,verdict,score,report").eq("id", reportId).maybeSingle();
  if (reportError || !reportRow) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const { data: memories, error: memoryError } = await supabase.from("founder_memories").select("kind,title,content,created_at").eq("report_id", reportId).order("created_at", { ascending: false }).limit(30);
  if (memoryError) return NextResponse.json({ error: "Could not load founder evidence. Confirm the V2 SQL setup ran in Supabase." }, { status: 400 });
  const evidence = (memories ?? []) as Memory[];
  if (!evidence.length) return NextResponse.json({ error: "No evidence is linked to this report yet. Save interview notes, outreach replies, or pilot results to this report from the workspace first." }, { status: 400 });

  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: "AI evidence review is not configured." }, { status: 400 });

  const evidenceText = evidence.map(item => `[${item.kind}] ${item.title}: ${item.content}`).join("\n");
  const currentVerdict = asVerdict(reportRow.verdict, "TEST FIRST");
  const system = `You are re-evaluating a startup validation verdict using real founder-collected evidence — not new speculation. Only change the score or verdict if the evidence actually supports a change; do not move it just to seem responsive. Be skeptical of thin evidence (fewer than 3 entries, or all from one source). Explain your reasoning in plain terms a founder can act on. Respond with a single JSON object only, no markdown fences, no commentary outside the JSON, in exactly this shape: {"score": integer 0-100, "verdict": "BUILD" | "TEST FIRST" | "AVOID", "changed": boolean, "evidenceSummary": string, "reasoning": string, "repeatedSignals": string[]}`;
  const user = `Original idea: ${reportRow.idea}\nCurrent verdict: ${currentVerdict} (score ${reportRow.score})\nOriginal summary: ${(reportRow.report as { summary?: string })?.summary ?? ""}\n\nFounder-collected evidence since the original report (customer interviews, outreach replies, landing-page results, pilot commitments):\n${evidenceText}\n\nIdentify repeated pain points, objections, and buying signals across these entries. Return the JSON object now.`;

  let parsed: RecomputeResult;
  try {
    const raw = await groqComplete(system, user, { json: true, maxTokens: 900, temperature: 0.3 });
    parsed = normalizeRecompute(JSON.parse(raw), currentVerdict, reportRow.score);
  } catch (error) {
    console.error("[api/recompute] Groq generation failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "Could not reach the AI to recompute this report. Try again shortly." }, { status: 502 });
  }

  const priorReport = (reportRow.report ?? {}) as Record<string, unknown>;
  const updatedReport = {
    ...priorReport,
    evidenceApplied: true,
    evidenceRecomputedAt: new Date().toISOString(),
    evidenceCount: evidence.length,
    evidenceSummary: parsed.evidenceSummary,
    evidenceReasoning: parsed.reasoning,
    repeatedSignals: parsed.repeatedSignals,
    priorScore: reportRow.score,
    priorVerdict: reportRow.verdict,
  };

  const { error: updateError } = await supabase.from("reports").update({ score: parsed.score, verdict: parsed.verdict, report: updatedReport }).eq("id", reportId);
  if (updateError) return NextResponse.json({ error: "Recomputed, but could not save the update." }, { status: 500 });

  return NextResponse.json({ score: parsed.score, verdict: parsed.verdict, changed: parsed.changed, evidenceSummary: parsed.evidenceSummary, reasoning: parsed.reasoning, repeatedSignals: parsed.repeatedSignals, evidenceCount: evidence.length });
}
