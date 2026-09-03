import { NextResponse } from "next/server";
import { groqComplete } from "../../../../lib/ai";
import { createClient, hasSupabaseConfig } from "../../../../lib/supabase/server";
import { loadCompanyContext, formatCompanyContext } from "../../../../lib/company-context";

const SYSTEM_PROMPT = `You are the AI Co-Founder for this specific company — not a generic chatbot. You have the company's real context below: its profile, current goal, active mission, tasks, past decisions, and company memory. Answer from that context, not from general startup advice that would apply to any company.

Behave like a thoughtful co-founder, not a cheerleader:
- Challenge weak assumptions instead of agreeing with them.
- Point out missing evidence when a claim isn't backed by anything in company memory.
- Highlight risks and contradictions when you see them, including contradictions with past decisions.
- Recommend priorities and concrete next actions — do not just describe the situation.
- Do not suggest work that's already listed as completed in tasks or recorded in company memory.
- If you genuinely don't have enough context to answer well, say so and ask one specific question rather than guessing.

Be concise by default — this is a working conversation, not an essay. For a substantial recommendation, structure it as:
OBSERVATION: what you're seeing
WHY IT MATTERS: the stakes
RECOMMENDATION: what you think they should do
NEXT ACTION: one concrete, immediate step

For a quick factual question, just answer it directly without forcing that structure.`;

export async function POST(request: Request) {
  if (!hasSupabaseConfig() || !process.env.GROQ_API_KEY) return NextResponse.json({ error: "The Co-Founder isn't configured on this deployment yet." }, { status: 503 });
  const { companyId, question } = await request.json().catch(() => ({}));
  if (typeof companyId !== "string" || !companyId) return NextResponse.json({ error: "A company id is required." }, { status: 400 });
  if (typeof question !== "string" || !question.trim()) return NextResponse.json({ error: "Ask something first." }, { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const ctx = await loadCompanyContext(supabase, companyId);
  if (!ctx) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  let conversationId: string;
  const { data: existing } = await supabase.from("conversations").select("id").eq("company_id", companyId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (existing?.id) {
    conversationId = existing.id;
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
  } else {
    const { data: created } = await supabase.from("conversations").insert({ company_id: companyId, user_id: userId, title: question.slice(0, 80) }).select("id").single();
    if (!created) return NextResponse.json({ error: "Could not start a conversation." }, { status: 500 });
    conversationId = created.id;
  }

  await supabase.from("messages").insert({ conversation_id: conversationId, user_id: userId, role: "user", content: question.slice(0, 2000) });

  let answer: string;
  try {
    const user = `${formatCompanyContext(ctx)}\n\nFOUNDER'S QUESTION: ${question.slice(0, 2000)}`;
    answer = await groqComplete(SYSTEM_PROMPT, user, { maxTokens: 700, temperature: 0.5 });
  } catch (error) {
    console.error("[api/company/ask] AI generation failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "Could not reach the Co-Founder. Try again shortly." }, { status: 502 });
  }

  await supabase.from("messages").insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content: answer.slice(0, 4000) });

  return NextResponse.json({ answer });
}
