import Link from 'next/link';
import { AGENTS } from '../lib/agents/registry';
import { CONNECTORS, connectorStatus } from '../lib/connectors/registry';
import type { AgentRun } from '../lib/agents/runtime';
import type { V3Record } from '../lib/intelligence/data';
import AgentStatusRefresh from './agent-status-refresh';
import LocalTime from './local-time';

export default function AgentsPanel({ companyId, runs, connections, unavailable = false, demo = false }: { companyId: string; runs: AgentRun[]; connections: V3Record[]; unavailable?: boolean; demo?: boolean }) {
  return <section className="v3-module">
    <div className="v3-page-heading"><div><span className="v3-eyebrow">COMPANY EXECUTION</span><h1>Agent team</h1><p>The CEO Agent coordinates specialist work using your company context.</p></div></div>
    {unavailable && <p role="alert" className="v3-error">Agent history is unavailable. The agent migration and server configuration may need setup.</p>}
    <p className="v3-notice">{demo ? 'Presentation only. No agents are running and no company records will change.' : 'Talk to the CEO Agent in the right panel, then choose Assign specialists. The CEO decides which agents are needed. Follow-up tasks require approval.'}</p>
    {!demo && <AgentStatusRefresh companyId={companyId}/>}
    <article className="v3-card v3-agent-card"><h2>CEO Agent</h2><span className="v3-badge">Active coordinator</span><p>Owns founder intake and reports, chooses the right specialists, orders their work and explains the decision.</p><ul><li>Founder conversation and business report</li><li>Need-based specialist selection</li><li>Mission coordination and approval handoff</li></ul><p><b>Works with</b></p><ul><li>Company context — available</li><li>Coding, Research and Marketing Agents</li></ul></article>
    <div className="v3-provider-grid">{Object.values(AGENTS).map(agent => {
      const recent = runs.filter(r => r.agent_id === agent.id);
      const current = recent.find(r => ['queued', 'running', 'waiting_approval'].includes(r.status));
      return <article className="v3-card v3-agent-card" key={agent.id}>
        <h2>{agent.name}</h2><span className="v3-badge">{unavailable ? 'Unavailable' : current?.status.replaceAll('_', ' ') ?? 'Idle'}</span>
        <p>{agent.description}</p>
        {current && <p><b>Current objective:</b> {current.objective}</p>}
        <ul>{agent.capabilities.map(c => <li key={c}>{c}</li>)}</ul>
        <p><b>Tools</b></p><ul>{agent.connectors.map(id => <li key={id}>{id === 'internal' ? 'Company context — available' : id === 'web' ? 'Web research — available' : (CONNECTORS.find(c => c.id === id)?.name ?? id) + ' — ' + connectorStatus(id, connections.find(c => c.provider === id))}</li>)}</ul>
        {recent[0] && <p>Recent activity: {recent[0].output?.summary ?? recent[0].error_message ?? recent[0].objective}</p>}
      </article>;
    })}</div>
    <h2>Recent runs</h2>{runs.length ? runs.map(run => <article className="v3-card v3-agent-card" key={run.id}>
      <h3>{AGENTS[run.agent_id].name}: {run.objective}</h3><span className="v3-badge">{run.status.replaceAll('_', ' ')}</span>
      <p>{run.output?.summary ?? run.error_message ?? 'Waiting for its turn in the bounded workflow.'}</p>
      {run.output && <details><summary>Findings, drafts and unknowns</summary>
        {run.output.findings.map((f,i) => <p key={i}><b>{f.kind}:</b> {f.content} {f.evidenceIds.length > 0 && <small>Evidence: {f.evidenceIds.join(', ')}</small>}</p>)}
        {run.output.drafts.map((d,i) => <p key={i}>{d}</p>)}
        {run.output.unknowns.map((u,i) => <p key={i}>Unknown: {u}</p>)}
        {!!run.output.sources?.length && <><b>Sources</b><ul>{run.output.sources.map(source=><li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · {source.domain}</li>)}</ul></>}
      </details>}
      <small><LocalTime iso={run.created_at}/></small>
      <div className="v3-button-row"><Link href={demo ? '/demo/v3?section=approvals' : `/company/${companyId}/approvals`}>Review approvals</Link><Link href={demo ? '/demo/v3?section=executions' : `/company/${companyId}/executions`}>Execution history</Link></div>
    </article>) : <p>No agent runs yet.</p>}
  </section>;
}
