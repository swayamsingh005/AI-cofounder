import { NextResponse } from "next/server";
import { groqComplete } from "../../../lib/ai";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";

type Toolkit = { angle: string; email: string; linkedin: string; callScript: string[]; objections: string[] };

function normalize(raw: unknown): Toolkit {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const text = (key: string, backup: string) => typeof record[key] === "string" && (record[key] as string).trim() ? (record[key] as string).slice(0, 2000) : backup;
  const list = (key: string) => Array.isArray(record[key]) ? (record[key] as unknown[]).filter((item): item is string => typeof item === "string").slice(0, 8) : [];
  return {
    angle: text("angle", "Lead with the specific outcome this customer wants, not the product category."),
    email: text("email", "Could not generate an email draft — try again."),
    linkedin: text("linkedin", "Could not generate a LinkedIn draft — try again."),
    callScript: list("callScript").length ? list("callScript") : ["Open by naming their specific problem, not your product.", "Ask what they currently do instead and what it costs them.", "Offer a small, specific paid pilot — not a demo."],
    objections: list("objections").length ? list("objections") : ["\"We already have a workaround\" — ask what it costs them in time or money.", "\"Not a priority right now\" — ask what would make it one."],
  };
}

export async function POST(request: Request) {
  if (!hasSupabaseConfig() || !process.env.GROQ_API_KEY) return NextResponse.json({ error: "AI workspace is not configured." }, { status: 503 });
  const supabase = await createClient(); const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const { customer, offer } = await request.json();
  if (typeof customer !== "string" || typeof offer !== "string" || !customer.trim() || !offer.trim()) return NextResponse.json({ error: "Add a target customer and offer." }, { status: 400 });
  try {
    const system = `Create a practical first-customer outreach toolkit. Do not claim verified facts you weren't given. Write concise, ethical, non-spammy drafts. Respond with a single JSON object only, no markdown fences, no commentary outside the JSON, in exactly this shape: {"angle": string, "email": string, "linkedin": string, "callScript": string[], "objections": string[]}`;
    const user = `Target customer: ${customer.slice(0, 500)}\nOffer: ${offer.slice(0, 800)}\n\nReturn the JSON object now.`;
    const raw = await groqComplete(system, user, { json: true, maxTokens: 1200, temperature: 0.5 });
    return NextResponse.json(normalize(JSON.parse(raw)));
  } catch (error) {
    console.error("[api/customer-toolkit] Groq generation failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: "Toolkit generation is temporarily unavailable." }, { status: 502 });
  }
}
