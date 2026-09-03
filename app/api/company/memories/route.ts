import { NextResponse } from "next/server";
import { createClient, hasSupabaseConfig } from "../../../../lib/supabase/server";

const VALID_KINDS = ["fact", "assumption", "decision", "learning", "customer_insight", "risk", "strategy", "experiment", "event"] as const;

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  const { companyId, title, content, kind } = await request.json().catch(() => ({}));
  if (typeof companyId !== "string" || !companyId) return NextResponse.json({ error: "A company id is required." }, { status: 400 });
  if (typeof content !== "string" || !content.trim()) return NextResponse.json({ error: "There's nothing to remember." }, { status: 400 });
  const cleanKind = VALID_KINDS.includes(kind) ? kind : "learning";

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: company } = await supabase.from("companies").select("id").eq("id", companyId).eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  const cleanTitle = typeof title === "string" && title.trim() ? title.trim().slice(0, 200) : content.trim().slice(0, 80);
  const { data: memory, error } = await supabase.from("memories").insert({ company_id: companyId, user_id: userId, kind: cleanKind, title: cleanTitle, content: content.trim().slice(0, 2000), source: "user" }).select("id,kind,title,content").single();
  if (error || !memory) return NextResponse.json({ error: "Could not save that to memory." }, { status: 500 });

  await supabase.from("activity_events").insert({ company_id: companyId, user_id: userId, kind: "memory_saved", title: `Remembered: ${memory.title}` });

  return NextResponse.json({ memory });
}
