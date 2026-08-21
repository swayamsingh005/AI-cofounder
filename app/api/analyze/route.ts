import { NextResponse } from "next/server";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";

export async function POST(request: Request) {
  const { idea } = await request.json();
  const title = typeof idea === "string" && idea.trim() ? idea.trim().split(/[.!?]/)[0].slice(0, 72) : "New venture";
  // This transparent fallback keeps the UI usable before a provider is configured.
  // Replace with a server-side model call plus retrieved/cited sources for production.
  const report = {
    score: 74, verdict: "TEST FIRST", title,
    summary: "The idea contains a potentially valuable customer problem, but its appeal, price sensitivity and differentiation need evidence before a full product investment.",
    problem: "Early customers are likely buying a faster, more dependable way to complete an important job—not technology for its own sake.",
    gap: "The strongest opening is a narrow audience, a specific high-frequency problem and a result that customers can measure.",
    mvp: ["One workflow that solves the highest-friction customer job", "A clear before/after outcome", "Manual support behind the scenes where needed", "Measurement for the primary customer result"],
    avoid: ["Broad platform features", "Premature automation", "Complex permissions", "Anything not required to test willingness to pay"],
    sources: ["Research source collection pending provider configuration", "Founder interviews — required validation", "AI-generated directional assessment"]
  };
  if (hasSupabaseConfig()) {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (userId) {
      const { data, error } = await supabase.from("reports").insert({ user_id: userId, idea: typeof idea === "string" ? idea : "", title: report.title, verdict: report.verdict, score: report.score, report }).select("id").single();
      if (error) return NextResponse.json({ ...report, warning: "Your report was generated but could not be saved." });
      return NextResponse.json({ ...report, id: data.id, saved: true });
    }
  }
  return NextResponse.json({ ...report, saved: false });
}
