import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../../lib/supabase/server";
import { loadCompanyContext } from "../../../../lib/company-context";
import TaskItem from "../../../../components/task-item";

export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseConfig()) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) notFound();

  const ctx = await loadCompanyContext(supabase, id);
  if (!ctx) notFound();

  if (!ctx.activeMission) {
    return (
      <section className="page-section">
        <div className="page-header"><span>MISSION</span><h1>No active mission yet.</h1></div>
        <div className="company-empty"><p>Nothing is scheduled yet.</p><small>Ask your Co-Founder to turn your current objective into a mission.</small></div>
      </section>
    );
  }

  const { data: milestones } = await supabase.from("milestones").select("id,title,status,sort_order").eq("mission_id", ctx.activeMission.id).order("sort_order", { ascending: true });
  const { data: fullTasks } = await supabase.from("tasks").select("id,title,description,status,priority,milestone_id").eq("mission_id", ctx.activeMission.id).order("created_at", { ascending: true });
  const tasksByMilestone = new Map<string, typeof fullTasks>();
  for (const task of fullTasks ?? []) {
    const key = task.milestone_id ?? "unassigned";
    if (!tasksByMilestone.has(key)) tasksByMilestone.set(key, []);
    tasksByMilestone.get(key)!.push(task);
  }
  const totalTasks = fullTasks?.length ?? 0;
  const doneTasks = (fullTasks ?? []).filter(t => t.status === "completed").length;

  return (
    <section className="page-section">
      <div className="page-header"><span>MISSION</span><h1>{ctx.activeMission.objective}</h1></div>
      {ctx.activeMission.whyItMatters && <p className="mission-why">{ctx.activeMission.whyItMatters}</p>}
      {ctx.activeMission.successCriteria && <p className="mission-success"><b>Success criteria:</b> {ctx.activeMission.successCriteria}</p>}
      <div className="progress-track"><i style={{ width: `${totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0}%` }} /></div>
      <small>{doneTasks} / {totalTasks} tasks completed</small>

      <div className="milestone-list milestone-list-full">
        {(milestones ?? []).map(milestone => {
          const tasks = tasksByMilestone.get(milestone.id) ?? [];
          const milestoneDone = tasks.filter(t => t.status === "completed").length;
          const complete = tasks.length > 0 && milestoneDone === tasks.length;
          return (
            <div className={complete ? "milestone milestone-complete" : "milestone"} key={milestone.id}>
              <h3>{milestone.title} <small>{milestoneDone}/{tasks.length}</small></h3>
              <ul>{tasks.map(task => <TaskItem key={task.id} id={task.id} title={task.title} priority={task.priority} initialStatus={task.status} />)}</ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
