import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";
import { loadCompanyContext } from "../../../lib/company-context";
import { getOrCreateDailyBrief } from "../../../lib/daily-brief";
import StartTaskButton from "../../../components/start-task-button";
import LocalTime from "../../../components/local-time";

const ACTIVITY_ICON: Record<string, string> = {
  company_created: "✦", goal_created: "◎", mission_created: "▶", task_completed: "✓",
  decision_recorded: "◆", decision_updated: "◆", memory_saved: "◇", task_created: "＋",
};

export default async function CompanyOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseConfig()) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) notFound();

  const ctx = await loadCompanyContext(supabase, id);
  if (!ctx) notFound();

  const brief = await getOrCreateDailyBrief(supabase, id, claims.claims.sub);

  // All active missions, not just the primary one — the dashboard shows every mission in
  // progress, not just the one featured elsewhere on this page.
  const { data: missions } = await supabase.from("missions").select("id,objective,progress,status").eq("company_id", id).eq("status", "active").order("is_primary", { ascending: false });
  const missionIds = (missions ?? []).map(m => m.id);
  const { data: missionTasks } = missionIds.length ? await supabase.from("tasks").select("mission_id,status").in("mission_id", missionIds) : { data: [] };
  const taskCountByMission = new Map<string, { total: number; done: number }>();
  for (const task of missionTasks ?? []) {
    const entry = taskCountByMission.get(task.mission_id) ?? { total: 0, done: 0 };
    entry.total += 1; if (task.status === "completed") entry.done += 1;
    taskCountByMission.set(task.mission_id, entry);
  }

  const { count: tasksToDoCount } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", id).eq("status", "todo");
  const { count: highPriorityCount } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", id).eq("status", "todo").in("priority", ["high", "critical"]);
  const { count: decisionsOpenCount } = await supabase.from("decisions").select("id", { count: "exact", head: true }).eq("company_id", id).eq("status", "active");

  // "Today's Focus" — real open tasks ranked by priority, not fabricated clock times. The
  // reference shows a scheduled-time list; there's no time-of-day data in the schema to back
  // that honestly, so this shows what to focus on, not when.
  const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const { data: focusTasksRaw } = await supabase.from("tasks").select("id,title,priority").eq("company_id", id).eq("status", "todo").limit(20);
  const focusTasks = (focusTasksRaw ?? []).sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9)).slice(0, 4);

  return (
    <section className="overview-page">
      <div className="company-header">
        <div className="eyebrow"><span></span> {ctx.company.stage.toUpperCase()}</div>
        <h1>Good morning 👋</h1>
        <p className="company-tagline">Let&rsquo;s build {ctx.company.name} today.</p>
      </div>

      <div className="stat-card-row">
        <div className="stat-card"><small>Primary Goal Progress</small><b>{ctx.primaryGoal?.progress ?? 0}%</b><em>{ctx.primaryGoal ? "On track" : "No goal yet"}</em></div>
        <div className="stat-card"><small>Active Missions</small><b>{missions?.length ?? 0}</b><em>{missions?.length ? `${missions.length} in progress` : "None yet"}</em></div>
        <div className="stat-card"><small>Tasks to do</small><b>{tasksToDoCount ?? 0}</b><em className={highPriorityCount ? "stat-warn" : ""}>{highPriorityCount ?? 0} high priority</em></div>
        <div className="stat-card"><small>Open Decisions</small><b>{decisionsOpenCount ?? 0}</b><em>{decisionsOpenCount ? "Active" : "None pending"}</em></div>
      </div>

      {brief && (
        <div className="daily-brief" id="daily-brief">
          <div className="next-action" id="next-action">
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
        <div className="company-empty"><p>No goal set yet.</p><small>Ask your Co-Founder to set one based on this company&rsquo;s context.</small></div>
      )}

      <div className="section-row-header"><h3>Active Missions</h3><Link href={`/company/${id}/mission`}>View all missions →</Link></div>
      {missions?.length ? (
        <div className="mission-card-grid">
          {missions.map((mission, index) => {
            const counts = taskCountByMission.get(mission.id) ?? { total: 0, done: 0 };
            return (
              <Link href={`/company/${id}/mission`} key={mission.id} className="mission-mini-card">
                <span className="mission-mini-number">{index + 1}</span>
                <b>{mission.objective}</b>
                <div className="progress-track"><i style={{ width: `${mission.progress}%` }} /></div>
                <small>{mission.progress}% · {counts.done}/{counts.total} tasks</small>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="company-empty"><p>Nothing is scheduled yet.</p><small>Ask your Co-Founder to turn your current objective into a mission.</small></div>
      )}

      {focusTasks.length > 0 && (
        <div className="today-focus">
          <span>TODAY&rsquo;S FOCUS</span>
          <ul>{focusTasks.map(task => <li key={task.id}><em className={`priority-${task.priority}`}>{task.priority}</em> {task.title}</li>)}</ul>
        </div>
      )}

      <div className="overview-bottom">
        <div className="decisions-panel">
          <span>RECENT DECISIONS</span>
          {ctx.recentDecisions.length ? (
            <ul>{ctx.recentDecisions.slice(0, 3).map(d => <li key={d.id}>{d.title}{d.status !== "active" ? ` (${d.status})` : ""}</li>)}</ul>
          ) : (
            <p className="company-empty-inline">No decisions recorded yet.</p>
          )}
          <Link href={`/company/${id}/decisions`} className="overview-view-all">View all decisions →</Link>
        </div>

        <div className="activity-panel">
          <span>RECENT ACTIVITY</span>
          {ctx.recentActivity.length ? (
            <ul>{ctx.recentActivity.slice(0, 5).map((event, index) => (
              <li key={index}>
                <b>{ACTIVITY_ICON[event.kind] ?? "•"}</b>
                <div><p>{event.title}</p><small><LocalTime iso={event.createdAt} /></small></div>
              </li>
            ))}</ul>
          ) : (
            <p className="company-empty-inline">Nothing yet — activity shows up here as you work.</p>
          )}
        </div>
      </div>
    </section>
  );
}
