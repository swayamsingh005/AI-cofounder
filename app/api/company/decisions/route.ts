import { NextResponse } from "next/server";
import { createClient, hasSupabaseConfig } from "../../../../lib/supabase/server";

const VALID_STATUSES = ["active", "reconsidered", "reversed"] as const;

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  const { companyId, title, reasoning } = await request.json().catch(() => ({}));
  if (typeof companyId !== "string" || !companyId) return NextResponse.json({ error: "A company id is required." }, { status: 400 });
  if (typeof title !== "string" || !title.trim()) return NextResponse.json({ error: "A decision needs a title." }, { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Confirm this company actually belongs to the requesting user before writing anything tied to
  // it — never trust a client-supplied companyId, even though RLS would independently block a
  // cross-user insert too.
  const { data: company } = await supabase.from("companies").select("id").eq("id", companyId).eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  const { data: decision, error } = await supabase.from("decisions").insert({
    company_id: companyId, user_id: userId,
    title: title.trim().slice(0, 300),
    reasoning: typeof reasoning === "string" ? reasoning.trim().slice(0, 1000) : null,
  }).select("id,title,reasoning,status,created_at").single();
  if (error || !decision) return NextResponse.json({ error: "Could not record the decision." }, { status: 500 });

  await supabase.from("activity_events").insert({ company_id: companyId, user_id: userId, kind: "decision_recorded", title: `Decision: ${decision.title}` });

  return NextResponse.json({ decision });
}

export async function PATCH(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  const { decisionId, status } = await request.json().catch(() => ({}));
  if (typeof decisionId !== "string" || !decisionId) return NextResponse.json({ error: "A decision id is required." }, { status: 400 });
  if (!VALID_STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: decision } = await supabase.from("decisions").select("id,company_id,title").eq("id", decisionId).eq("user_id", userId).maybeSingle();
  if (!decision) return NextResponse.json({ error: "Decision not found." }, { status: 404 });

  const { error } = await supabase.from("decisions").update({ status, updated_at: new Date().toISOString() }).eq("id", decisionId).eq("user_id", userId);
  if (error) return NextResponse.json({ error: "Could not update the decision." }, { status: 500 });

  await supabase.from("activity_events").insert({ company_id: decision.company_id, user_id: userId, kind: "decision_updated", title: `Decision marked ${status}: ${decision.title}` });

  return NextResponse.json({ ok: true });
}
