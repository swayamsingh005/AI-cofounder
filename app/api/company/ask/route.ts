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

Any price, cost, or monetary figure you mention must use the correct currency for the company's stated geography in the context below — ₹ for India, other local currency symbols for other named countries, $ only if the geography is genuinely global, unspecified, or explicitly US/international. Do not default to $ for a non-US market.

FORMATTING — this matters, output is rendered as plain text, not markdown:
- Never use markdown symbols: no **bold**, no #headers, no backticks. Plain words only.
- Be concise by default — this is a working conversation, not an essay.
- For a quick factual question, just answer in 1-3 plain sentences, no special structure.
- For a substantial recommendation, structure it as exactly these four labels, each alone on its own line followed by a colon, in this order: "OBSERVATION:", "WHY IT MATTERS:", "RECOMMENDATION:", "NEXT ACTION:". Under each label, write 1-3 short sentences, OR a few bullet points each starting with "- " on its own line if there are multiple distinct items. Do not number steps with "1." — use "- " for every bullet.`;

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
    answer = await groqComplete(SYSTEM_PROMPT, user, { maxTokens: 900, temperature: 0.5 });
  } catch (error) {
    console.error("[api/company/ask] AI generation failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "Could not reach the Co-Founder. Try again shortly." }, { status: 502 });
  }

  await supabase.from("messages").insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content: answer.slice(0, 4000) });

  return NextResponse.json({ answer });
}
