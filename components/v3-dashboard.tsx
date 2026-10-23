import Link from 'next/link';
import AskCofounder from './ask-cofounder';
import AiOrb from './ai-orb';
import LocalTime from './local-time';
import type { IntelligenceData } from '../lib/intelligence/data';
import type { DailyBrief } from '../lib/daily-brief';
import type { CompanyPulse } from '../lib/intelligence/pulse';

export type DashboardProps={companyId:string;name:string;displayName:string;data:IntelligenceData;missions:{id:string;objective:string;progress:number}[];tasks:{id:string;title:string;status:string;priority:string}[];goal:{title:string;progress:number}|null;brief:DailyBrief|null;pulse?:CompanyPulse;demo?:boolean};

function stateLabel(status?:string){
  if(status==='awaiting_approval'||status==='waiting_approval')return 'Needs your approval';
  if(status==='draft'||status==='queued'||status==='running')return 'Working';
  if(status==='failed')return 'Needs attention';
  if(status==='completed'||status==='approved')return 'Ready';
  return 'Idle';
}

export default function V3Dashboard({companyId,name,displayName,data,brief}:DashboardProps) {
  const coding=data.actions.find(action=>action.provider==='github'&&action.action_type==='github.create_pull_request');
  const research=data.events.find(event=>event.source==='research');
  const pending=data.actions.filter(action=>action.status==='awaiting_approval');
  const agents=[
    {name:'Coding Agent',href:'coding',icon:'⌨',status:stateLabel(coding?.status),summary:coding?.title??'Ready to build, test and preview your product.'},
    {name:'Marketing Agent',href:'marketing',icon:'◎',status:'Ready',summary:'Create campaigns and review every draft before publishing.'},
    {name:'Research Agent',href:'research',icon:'⌕',status:research?'Ready':'Idle',summary:research?.title??'Research markets and competitors with cited sources.'},
  ];
  return <section className="home-simple">
    <header className="home-welcome"><div><span className="v3-eyebrow">YOUR COMPANY COMMAND CENTRE</span><h1>Welcome back{displayName?`, ${displayName}`:''}</h1><p>See what your AI team is doing, decide what happens next, and approve important work.</p></div><span className="v3-badge">{name}</span></header>
    <div className="home-ceo-grid">
      <article className="ceo-workspace v3-card" id="company-assistant"><div className="ceo-intro"><AiOrb size={58}/><div><span className="v3-eyebrow">CEO AGENT</span><h2>What should we work on?</h2><p>Ask one question or give one objective. I’ll use company context and route specialist work when needed.</p></div></div><AskCofounder companyId={companyId}/></article>
      <article className="daily-summary v3-card"><span className="v3-eyebrow">TODAY’S SUMMARY</span><h2>{brief?.nextBestAction.title??'Your AI team is ready'}</h2><p>{brief?.nextBestAction.reason??'Give the CEO Agent an objective, or open a specialist workspace directly.'}</p>{pending.length>0?<Link className="v3-primary" href={`/company/${companyId}/coding`}>Review {pending.length} item{pending.length===1?'':'s'} needing approval</Link>:<span className="status-calm">✓ Nothing is waiting for approval</span>}</article>
    </div>
    <div className="home-section-heading"><div><span className="v3-eyebrow">YOUR AI TEAM</span><h2>Choose an agent</h2></div><p>Each workspace contains only the conversation, work, and connections that agent needs.</p></div>
    <div className="agent-launch-grid">{agents.map(agent=><Link className="agent-launch-card" href={`/company/${companyId}/${agent.href}`} key={agent.href}><span className="agent-launch-icon">{agent.icon}</span><div><h3>{agent.name}</h3><span className={`agent-state ${agent.status.toLowerCase().replaceAll(' ','-')}`}>{agent.status}</span><p>{agent.summary}</p></div><b aria-hidden="true">→</b></Link>)}</div>
    <div className="home-bottom-grid">
      <article className="v3-card"><div className="v3-card-heading"><h2>Recent verified activity</h2></div>{data.events.slice(0,4).length?<ul className="simple-activity">{data.events.slice(0,4).map(event=><li key={event.id}><span>{event.title}</span><small><LocalTime iso={event.occurred_at??event.created_at}/></small></li>)}</ul>:<p>No verified activity yet. Your agents will record work here as it happens.</p>}</article>
      <article className="v3-card"><span className="v3-eyebrow">COMPANY DIRECTION</span><h2>{brief?.nextBestAction?.title??'Set the next objective'}</h2><p>{brief?.nextBestAction?.reason??'Tell the CEO Agent what outcome matters most right now.'}</p><Link href={`/company/${companyId}#company-assistant`}>Discuss with CEO Agent →</Link></article>
    </div>
  </section>;
}
