import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";
import { loadCompanyContext } from "../../../lib/company-context";
import AskCofounder from "../../../components/ask-cofounder";
import TaskItem from "../../../components/task-item";
import TaskListView from "../../../components/task-list-view";
import StartTaskButton from "../../../components/start-task-button";
import DecisionPanel from "../../../components/decision-panel";
import LocalTime from "../../../components/local-time";
import { getOrCreateDailyBrief } from "../../../lib/daily-brief";

const ACTIVITY_ICON: Record<string, string> = {
  company_created: "✦", goal_created: "◎", mission_created: "▶", task_completed: "✓",
  decision_recorded: "◆", decision_updated: "◆",
};

export default async function CompanyWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseConfig()) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) notFound();

  const ctx = await loadCompanyContext(supabase, id);
  if (!ctx) notFound();

  const brief = await getOrCreateDailyBrief(supabase, id, claims.claims.sub);

  const { data: milestones } = await supabase.from("milestones").select("id,title,status,sort_order").eq("mission_id", ctx.activeMission?.id ?? "").order("sort_order", { ascending: true });
  const tasksByMilestone = new Map<string, { id: string; title: string; status: string; priority: string }[]>();
  const { data: fullTasks } = ctx.activeMission ? await supabase.from("tasks").select("id,title,description,status,priority,milestone_id").eq("mission_id", ctx.activeMission.id).order("created_at", { ascending: true }) : { data: [] };
  for (const task of fullTasks ?? []) {
    const key = task.milestone_id ?? "unassigned";
    if (!tasksByMilestone.has(key)) tasksByMilestone.set(key, []);
    tasksByMilestone.get(key)!.push(task as { id: string; title: string; status: string; priority: string });
  }

  const totalTasks = fullTasks?.length ?? 0;
  const doneTasks = (fullTasks ?? []).filter(t => t.status === "completed").length;

  // Tasks with no mission (e.g. quick-created from the command bar) wouldn't show up anywhere
  // otherwise — the milestone list above only covers the active mission's own tasks.
  const { data: standaloneTasks } = await supabase.from("tasks").select("id,title,status,priority").eq("company_id", id).is("mission_id", null).order("created_at", { ascending: false }).limit(20);

  return (
    <main className="app-shell company-shell">
      <header className="app-nav">
        <Link className="brand" href="/"><span className="brand-mark">✦</span> AI Co-Founder</Link>
        <div><Link href="/companies">My companies</Link><Link href="/reports">Reports</Link></div>
      </header>
      <section className="company-workspace">
        <div className="company-header">
          <div className="eyebrow"><span></span> {ctx.company.stage.toUpperCase()}</div>
          <h1>{ctx.company.name}</h1>
        </div>

        {brief && (
          <div className="daily-brief">
            <div className="next-action">
              <span>NEXT BEST ACTION</span>
              <h2>{brief.nextBestAction.title}</h2>
              <p>{brief.nextBestAction.reason}</p>
              {brief.nextBestAction.taskId && <StartTaskButton taskId={brief.nextBestAction.taskId} />}
            </div>
            {brief.attentionItems.length > 0 && (
              <div className="attention-list">
                <span>ALSO NEEDS ATTENTION</span>
                <ul>
                  {brief.attentionItems.map((item, index) => (
                    <li key={index} className={`brief-${item.severity}`}>
                      <i>{item.severity === "high" ? "🔴" : item.severity === "medium" ? "🟡" : "💡"}</i>
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {ctx.primaryGoal ? (
          <div className="company-goal">
            <span>PRIMARY GOAL</span>
            <h2>{ctx.primaryGoal.title}</h2>
            {ctx.primaryGoal.target && <p>{ctx.primaryGoal.target}</p>}
            <div className="progress-track"><i style={{ width: `${ctx.primaryGoal.progress}%` }} /></div>
            <small>{ctx.primaryGoal.progress}% complete</small>
          </div>
        ) : (
          <div className="company-empty"><p>No goal set yet.</p><small>Ask your Co-Founder to set one based on this company's context.</small></div>
        )}

        <div className="company-grid">
          <div className="company-main">
            {ctx.activeMission ? (
              <div className="company-mission">
                <span>ACTIVE MISSION</span>
                <h2>{ctx.activeMission.objective}</h2>
                {ctx.activeMission.whyItMatters && <p>{ctx.activeMission.whyItMatters}</p>}
                <div className="progress-track"><i style={{ width: `${totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0}%` }} /></div>
                <small>{doneTasks} / {totalTasks} tasks completed</small>

                <TaskListView
                  milestones={(milestones ?? []).map(m => ({ id: m.id, title: m.title, status: m.status, sort_order: m.sort_order }))}
                  tasksByMilestone={Object.fromEntries(tasksByMilestone)}
                  excludeTaskId={brief?.nextBestAction.taskId ?? null}
                  totalTasks={totalTasks}
                />
              </div>
            ) : (
              <div className="company-empty"><p>Nothing is scheduled yet.</p><small>Ask your Co-Founder to turn your current objective into a mission.</small></div>
            )}

            {standaloneTasks && standaloneTasks.length > 0 && (
              <div className="milestone standalone-tasks">
                <h3>Other tasks</h3>
                <ul>{standaloneTasks.map(task => <TaskItem key={task.id} id={task.id} title={task.title} priority={task.priority} initialStatus={task.status} />)}</ul>
              </div>
            )}
          </div>

          <aside className="company-side">
            <div className="cofounder-panel">
              <span>AI CO-FOUNDER</span>
              <AskCofounder companyId={ctx.company.id} />
            </div>

            <div className="decisions-panel">
              <span>DECISIONS</span>
              <DecisionPanel companyId={ctx.company.id} initialDecisions={ctx.recentDecisions.map(d => ({ id: d.id, title: d.title, reasoning: d.reasoning, status: d.status }))} />
            </div>

            <div className="activity-panel">
              <span>RECENT ACTIVITY</span>
              {ctx.recentActivity.length ? (
                <ul>{ctx.recentActivity.map((event, index) => (
                  <li key={index}>
                    <b>{ACTIVITY_ICON[event.kind] ?? "•"}</b>
                    <div><p>{event.title}</p><small><LocalTime iso={event.createdAt} /></small></div>
                  </li>
                ))}</ul>
              ) : (
                <p className="company-empty-inline">Nothing yet — activity shows up here as you work.</p>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
