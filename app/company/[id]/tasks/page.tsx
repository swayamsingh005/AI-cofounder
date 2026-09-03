import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../../lib/supabase/server";
import TaskItem from "../../../../components/task-item";

const GROUPS = [
  { status: "in_progress", label: "In progress" },
  { status: "todo", label: "To do" },
  { status: "blocked", label: "Blocked" },
  { status: "completed", label: "Completed" },
] as const;

export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseConfig()) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) notFound();

  const { data: company } = await supabase.from("companies").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!company) notFound();

  const { data: tasks } = await supabase.from("tasks").select("id,title,status,priority").eq("company_id", id).order("created_at", { ascending: false });
  const all = tasks ?? [];

  return (
    <section className="page-section">
      <div className="page-header"><span>TASKS</span><h1>All tasks</h1></div>
      {all.length === 0 && <div className="company-empty"><p>No execution tasks yet.</p><small>Ask your Co-Founder to create a mission, or add one from the command bar.</small></div>}
      {GROUPS.map(group => {
        const items = all.filter(t => t.status === group.status);
        if (!items.length) return null;
        return (
          <div className="task-group" key={group.status}>
            <h3>{group.label} <small>{items.length}</small></h3>
            <ul>{items.map(task => <TaskItem key={task.id} id={task.id} title={task.title} priority={task.priority} initialStatus={task.status} />)}</ul>
          </div>
        );
      })}
    </section>
  );
}
