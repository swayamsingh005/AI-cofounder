import { NextResponse } from "next/server";
import { createClient, hasSupabaseConfig } from "../../../../lib/supabase/server";
import { polishOneLine } from "../../../../lib/ai";

const VALID_STATUSES = ["todo", "in_progress", "blocked", "completed"] as const;
const VALID_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 400 });
  const { companyId, title, priority } = await request.json().catch(() => ({}));
  if (typeof companyId !== "string" || !companyId) return NextResponse.json({ error: "A company id is required." }, { status: 400 });
  if (typeof title !== "string" || !title.trim()) return NextResponse.json({ error: "A task needs a title." }, { status: 400 });
  const cleanPriority = VALID_PRIORITIES.includes(priority) ? priority : "medium";

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Confirm ownership before writing anything tied to this company — never trust a client-supplied
  // companyId, even though RLS would independently block a cross-user insert too.
  const { data: company } = await supabase.from("companies").select("id").eq("id", companyId).eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  // Clean up grammar/phrasing before saving — same meaning and details, just one polished
  // sentence instead of whatever was typed quickly into the command bar.
  const cleanTitle = await polishOneLine(title.trim().slice(0, 400), "This is a task on a startup's to-do list.");

  // Standalone task — no goal/mission/milestone. Shows up in the dashboard's "Other tasks"
  // section (tasks with mission_id IS NULL), separate from the active mission's task list.
  const { data: task, error } = await supabase.from("tasks").insert({ company_id: companyId, user_id: userId, title: cleanTitle.slice(0, 200), priority: cleanPriority, status: "todo", source: "user" }).select("id,title,priority,status").single();
  if (error || !task) return NextResponse.json({ error: "Could not create the task." }, { status: 500 });

  await supabase.from("activity_events").insert({ company_id: companyId, user_id: userId, kind: "task_created", title: `Task added: ${task.title}` });

  return NextResponse.json({ task });
}

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
