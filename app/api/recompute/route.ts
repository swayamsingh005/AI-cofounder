import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";

type Memory = { kind: string; title: string; content: string; created_at: string };

const schema = {
  type: "object",
  properties: {
    score: { type: "integer" },
    verdict: { type: "string", enum: ["BUILD", "TEST FIRST", "AVOID"] },
    changed: { type: "boolean" },
    evidenceSummary: { type: "string" },
    reasoning: { type: "string" },
    repeatedSignals: { type: "array", items: { type: "string" } },
  },
  required: ["score", "verdict", "changed", "evidenceSummary", "reasoning", "repeatedSignals"],
  additionalProperties: false,
};

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

  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "Gemini is not configured." }, { status: 400 });

  const evidenceText = evidence.map(item => `[${item.kind}] ${item.title}: ${item.content}`).join("\n");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `You are re-evaluating a startup validation verdict using real founder-collected evidence — not new speculation.\n\nOriginal idea: ${reportRow.idea}\nCurrent verdict: ${reportRow.verdict} (score ${reportRow.score})\nOriginal summary: ${(reportRow.report as { summary?: string })?.summary ?? ""}\n\nFounder-collected evidence since the original report (customer interviews, outreach replies, landing-page results, pilot commitments):\n${evidenceText}\n\nIdentify repeated pain points, objections, and buying signals across these entries. Only change the score or verdict if the evidence actually supports a change — do not move it just to seem responsive. Be skeptical of thin evidence (fewer than 3 entries, or all from one source). Explain your reasoning in plain terms a founder can act on.`;
  const response = await ai.models.generateContent({ model: "gemini-3.5-flash-lite", contents: prompt, config: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: 900, temperature: 0.3 } });
  if (!response.text) return NextResponse.json({ error: "Gemini returned an empty response." }, { status: 502 });

  let parsed: { score: number; verdict: "BUILD" | "TEST FIRST" | "AVOID"; changed: boolean; evidenceSummary: string; reasoning: string; repeatedSignals: string[] };
  try { parsed = JSON.parse(response.text); } catch { return NextResponse.json({ error: "Could not parse the evidence recompute response." }, { status: 502 }); }

  const nextScore = Math.max(0, Math.min(100, Math.round(parsed.score)));
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

  const { error: updateError } = await supabase.from("reports").update({ score: nextScore, verdict: parsed.verdict, report: updatedReport }).eq("id", reportId);
  if (updateError) return NextResponse.json({ error: "Recomputed, but could not save the update." }, { status: 500 });

  return NextResponse.json({ score: nextScore, verdict: parsed.verdict, changed: parsed.verdict !== reportRow.verdict || nextScore !== reportRow.score, evidenceSummary: parsed.evidenceSummary, reasoning: parsed.reasoning, repeatedSignals: parsed.repeatedSignals, evidenceCount: evidence.length });
}
