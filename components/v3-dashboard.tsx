import Link from 'next/link';
import type { IntelligenceData } from '../lib/intelligence/data';
import { PROVIDERS } from '../lib/connectors/base';
import { connectorStatus } from '../lib/connectors/registry';
import { V3Button } from './v3-controls';
import StartTaskButton from './start-task-button';
import type { DailyBrief } from '../lib/daily-brief';
import { calculateCompanyPulse, type CompanyPulse } from '../lib/intelligence/pulse';

export type DashboardProps={companyId:string;name:string;displayName:string;data:IntelligenceData;missions:{id:string;objective:string;progress:number}[];tasks:{id:string;title:string;status:string;priority:string}[];goal:{title:string;progress:number}|null;brief:DailyBrief|null;pulse?:CompanyPulse;demo?:boolean};
function Bar({value,tone='purple'}:{value:number;tone?:string}) {return <div className={`v3-track ${tone}`}><i style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div>;}

export default function V3Dashboard({companyId,name,displayName,data,missions,tasks,goal,brief,pulse,demo=false}:DashboardProps) {
  const href=(section:string)=>demo?`/demo/v3?section=${section}`:`/company/${companyId}/${section}`;
  const livePulse=pulse??calculateCompanyPulse({profile:null,tasks,memories:[]});
  const pendingActions=data.actions.filter(action=>action.status==='awaiting_approval');
  const pendingBuild=pendingActions.find(action=>action.provider==='github'&&action.action_type==='github.create_pull_request');
  const insight=data.insights.find(item=>!['resolved','dismissed'].includes(item.status??'')&&item.severity!=='info');
  const connectedTools=data.connections.filter(connection=>connection.status==='connected');
  const ranks:Record<string,number>={critical:0,high:1,medium:2,low:3};
  const priorities=tasks.filter(task=>task.status!=='completed').toSorted((a,b)=>(ranks[a.priority]??4)-(ranks[b.priority]??4)).slice(0,4);
  const nextTitle=pendingBuild?`Review coding build: ${pendingBuild.title}`:insight?.title??brief?.nextBestAction.title??priorities[0]?.title??'Choose your next company objective';
  const nextDetail=pendingBuild?'The code and isolated checks are ready. Nothing will deploy until you approve it.':insight?.description??brief?.nextBestAction.reason??'Your workspace is clear. Set one concrete outcome for the team to work towards.';
  const nextHref=pendingBuild?href('approvals'):insight?href('insights'):priorities[0]?href('tasks'):href('agents');
  const scores=demo?[85,72,64,71,82]:livePulse.dimensions.map(dimension=>dimension.score);

  return <section className="v3-dashboard v3-dashboard-simple">
    <div className="v3-page-heading v3-simple-heading">
      <div><span className="v3-eyebrow">TODAY</span><h1>{displayName?`Good to see you, ${displayName}`:'Your company workspace'}</h1><p>One clear view of what needs attention at {name}.</p></div>
      <Link className="v3-button" href={href('agents')}>Open AI team</Link>
    </div>
    {demo&&<div className="v3-demo-banner">Presentation demo · All information below is simulated.</div>}
    {data.unavailable&&<p className="v3-error" role="alert">Some workspace data could not be loaded. Try refreshing before taking action.</p>}

    <article className="v3-card v3-focus-card">
      <div className="v3-focus-copy"><span>YOUR NEXT MOVE</span><h2>{nextTitle}</h2><p>{nextDetail}</p></div>
      <Link className="v3-button v3-primary" href={nextHref}>{pendingBuild?'Review and approve':'Open next step'} →</Link>
    </article>

    <div className="v3-summary-row" aria-label="Workspace summary">
      <Link href={href('tasks')} className="v3-summary-item"><small>Open tasks</small><strong>{tasks.filter(task=>task.status!=='completed').length}</strong><span>{priorities.filter(task=>['high','critical'].includes(task.priority)).length} high priority</span></Link>
      <Link href={href('mission')} className="v3-summary-item"><small>Active missions</small><strong>{missions.length}</strong><span>{missions.filter(mission=>mission.progress>0).length} in progress</span></Link>
      <Link href={href('approvals')} className="v3-summary-item"><small>Waiting for you</small><strong>{pendingActions.length}</strong><span>approval{pendingActions.length===1?'':'s'}</span></Link>
      <Link href={href('connections')} className="v3-summary-item"><small>Connected tools</small><strong>{connectedTools.length}</strong><span>of {PROVIDERS.length} available</span></Link>
    </div>

    <div className="v3-simple-grid">
      <article className="v3-card">
        <div className="v3-card-heading"><h2>Today’s work</h2><Link href={href('tasks')}>View all →</Link></div>
        {priorities.length?priorities.map(task=><div className="v3-task-row" key={task.id}><span className={`v3-priority ${task.priority}`} aria-label={task.priority}>●</span><span>{task.title}</span>{demo?<Link className="v3-button" href={href('approvals')}>Review</Link>:<StartTaskButton taskId={task.id}/>}</div>):<div className="v3-calm-empty"><b>No urgent tasks</b><p>Your list is clear. Create work only when it supports the current goal.</p></div>}
      </article>

      <article className="v3-card">
        <div className="v3-card-heading"><h2>Active missions</h2><Link href={href('mission')}>View all →</Link></div>
        {missions.length?missions.slice(0,3).map((mission,index)=><div className="v3-mission" key={mission.id}><span className={`v3-number tone-${index}`}>{index+1}</span><div><b>{mission.objective}</b><Bar value={mission.progress} tone={index===0?'green':index===2?'blue':'purple'}/></div><strong>{mission.progress}%</strong></div>):<div className="v3-calm-empty"><b>No active mission</b><p>Start with one measurable outcome rather than several parallel projects.</p></div>}
      </article>
    </div>

    <details className="v3-secondary-section">
      <summary><span><b>Company health and history</b><small>Pulse, goal, connected tools and recent activity</small></span><em>Show details</em></summary>
      <div className="v3-dashboard-grid v3-secondary-grid">
        <article className="v3-card v3-pulse">
          <div className="v3-card-heading"><h2>Company Pulse</h2><span className="v3-badge">Evidence based</span></div>
          <p>{demo?'Simulated presentation score.':`${livePulse.label} · ${livePulse.coverage}% evidence coverage`}</p>
          <div className="v3-pulse-body">
            <div className={`v3-ring ${demo?'is-demo':''}`} style={livePulse.score==null?undefined:{background:`conic-gradient(#22e8a2 0deg,#11e3df ${livePulse.score*3.6}deg,#173e53 ${livePulse.score*3.6}deg)`}}><div><strong>{demo?'78':livePulse.score??'—'}</strong><small>{livePulse.score==null?'Not enough data':'out of 100'}</small></div></div>
            <div className="v3-scores">{(demo?['Product','Market validation','Growth','Revenue','Execution']:livePulse.dimensions.map(dimension=>dimension.label)).map((label,index)=><div className="v3-score" key={label}><span>{label}</span><Bar value={scores[index]??0}/><b>{scores[index]??'—'}</b></div>)}</div>
          </div>
          <small>{demo?'Simulated score for presentation.':livePulse.note}</small>
        </article>

        <article className="v3-card" id="primary-goal"><div className="v3-card-heading"><h2>Primary goal</h2><Link href={href('overview')}>Open goal →</Link></div><h3>{goal?.title??'No primary goal yet'}</h3><Bar value={goal?.progress??0}/><p>{goal?`${goal.progress}% of linked tasks complete. Business outcomes should be validated separately.`:'Set one primary goal to align the team.'}</p><div id="daily-brief"><h3>{brief?.nextBestAction.title??'Daily brief is ready when you need it'}</h3><p>{brief?.nextBestAction.reason??'Refresh intelligence to create a brief from recorded company evidence.'}</p><V3Button companyId={companyId} op="refresh" demo={demo}>Refresh brief</V3Button></div></article>

        <article className="v3-card"><div className="v3-card-heading"><h2>Connected tools</h2><Link href={href('connections')}>Manage →</Link></div><div className="v3-tools">{PROVIDERS.map(provider=>{const connection=data.connections.find(item=>item.provider===provider.id);return <Link href={href('connections')} className="v3-tool" key={provider.id}><span className={`v3-tool-icon ${provider.id}`}>{provider.icon}</span><b>{provider.name}</b><small className={connection?.status==='connected'?'v3-green':''}>{demo?'Demo':connectorStatus(provider.id,connection)}</small></Link>})}</div></article>

        <article className="v3-card" id="activity"><div className="v3-card-heading"><h2>Recent activity</h2><Link href={href('events')}>View all →</Link></div>{data.events.length?data.events.slice(0,4).map(event=><div className="v3-event" key={event.id}><span className="v3-event-dot">✓</span><div><b>{event.title}</b><small>{demo?'Demo event':event.source} · {(event.occurred_at??event.created_at).slice(0,10)}</small></div></div>):<p>No connected activity yet.</p>}</article>
      </div>
    </details>
  </section>;
}
