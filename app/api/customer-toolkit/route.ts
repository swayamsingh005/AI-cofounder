import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";

export async function POST(request: Request) {
  if (!hasSupabaseConfig() || !process.env.GEMINI_API_KEY) return NextResponse.json({ error: "AI workspace is not configured." }, { status: 503 });
  const supabase = await createClient(); const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const { customer, offer } = await request.json();
  if (typeof customer !== "string" || typeof offer !== "string" || !customer.trim() || !offer.trim()) return NextResponse.json({ error: "Add a target customer and offer." }, { status: 400 });
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({ model: "gemini-3.5-flash-lite", contents: `Create a practical first-customer toolkit. Target customer: ${customer.slice(0,500)}. Offer: ${offer.slice(0,800)}. Do not claim verified facts. Write concise, ethical, non-spammy drafts.`, config: { responseMimeType: "application/json", responseJsonSchema: { type: "object", properties: { angle: { type: "string" }, email: { type: "string" }, linkedin: { type: "string" }, callScript: { type: "array", items: { type: "string" } }, objections: { type: "array", items: { type: "string" } } }, required: ["angle","email","linkedin","callScript","objections"], additionalProperties: false } } });
    return NextResponse.json(JSON.parse(response.text || "{}"));
  } catch { return NextResponse.json({ error: "Toolkit generation is temporarily unavailable." }, { status: 502 }); }
}
