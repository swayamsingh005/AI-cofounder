import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, hasSupabaseConfig } from "../../../lib/supabase/server";
import { loadCompanyContext } from "../../../lib/company-context";
import { getOrCreateDailyBrief } from "../../../lib/daily-brief";
import StartTaskButton from "../../../components/start-task-button";
import LocalTime from "../../../components/local-time";

const ACTIVITY_ICON: Record<string, string> = {
  company_created: "✦", goal_created: "◎", mission_created: "▶", task_completed: "✓",
  decision_recorded: "◆", decision_updated: "◆",
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

  let missionTaskCounts = { total: 0, done: 0 };
  if (ctx.activeMission) {
    const { count: total } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("mission_id", ctx.activeMission.id);
    const { count: done } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("mission_id", ctx.activeMission.id).eq("status", "completed");
    missionTaskCounts = { total: total ?? 0, done: done ?? 0 };
  }

  return (
    <section className="overview-page">
      <div className="company-header">
        <div className="eyebrow"><span></span> {ctx.company.stage.toUpperCase()}</div>
        <h1>{ctx.company.name}</h1>
        {ctx.profile?.description && <p className="company-tagline">{ctx.profile.description}</p>}
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
        <div className="company-empty"><p>No goal set yet.</p><small>Ask your Co-Founder to set one based on this company&rsquo;s context.</small></div>
      )}

      {ctx.activeMission ? (
        <Link href={`/company/${id}/mission`} className="company-mission company-mission-link">
          <span>ACTIVE MISSION</span>
          <h2>{ctx.activeMission.objective}</h2>
          <div className="progress-track"><i style={{ width: `${missionTaskCounts.total ? Math.round((missionTaskCounts.done / missionTaskCounts.total) * 100) : 0}%` }} /></div>
          <small>{missionTaskCounts.done} / {missionTaskCounts.total} tasks completed · Open mission →</small>
        </Link>
      ) : (
        <div className="company-empty"><p>Nothing is scheduled yet.</p><small>Ask your Co-Founder to turn your current objective into a mission.</small></div>
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
