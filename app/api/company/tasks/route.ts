import { NextResponse } from "next/server";
import { createClient, hasSupabaseConfig } from "../../../../lib/supabase/server";

const VALID_STATUSES = ["todo", "in_progress", "blocked", "completed"] as const;

export async function PATCH(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  const { taskId, status } = await request.json().catch(() => ({}));
  if (typeof taskId !== "string" || !taskId) return NextResponse.json({ error: "A task id is required." }, { status: 400 });
  if (!VALID_STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Explicit user_id filter alongside RLS — never trust a client-supplied id without a scoped
  // query, even though the RLS policy would also block a cross-user update on its own.
  const { data: task, error: taskError } = await supabase.from("tasks").select("id,company_id,title").eq("id", taskId).eq("user_id", userId).maybeSingle();
  if (taskError || !task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  // .update() alone returns no error even when it matches zero rows (e.g. a silent RLS mismatch) —
  // chaining .select().single() forces a real error if the row wasn't actually found and updated,
  // instead of us believing it worked and logging a completion that never happened.
  const { data: updated, error: updateError } = await supabase.from("tasks").update({ status, updated_at: new Date().toISOString() }).eq("id", taskId).eq("user_id", userId).select("id,status").single();
  if (updateError || !updated || updated.status !== status) return NextResponse.json({ error: "The task didn't actually update — try again." }, { status: 500 });

  if (status === "completed") {
    await supabase.from("activity_events").insert({ company_id: task.company_id, user_id: userId, kind: "task_completed", title: `Completed: ${task.title}` });
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
