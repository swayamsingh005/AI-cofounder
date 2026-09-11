import Link from 'next/link';
import type { IntelligenceData } from '../lib/intelligence/data';
export default function V3Status({companyId,data,demo=false}:{companyId:string;data:IntelligenceData;demo?:boolean}) {
  const href=(s:string)=>demo?`/demo/v3?section=${s}`:`/company/${companyId}/${s}`;
  const running=data.actions.filter(a=>a.status==='executing').length;
  const pending=data.actions.filter(a=>a.status==='awaiting_approval').length;
  return <div className="v3-status"><span className="v3-status-label">{demo?'Demo workspace':'On-demand workspace'}</span><p><i/> {running} actions executing</p><p><i/> {data.connections.filter(c=>c.status==='connected').length} {demo?'demo':'connected'} tools</p><p><i/> {pending} actions waiting for approval</p><small>{demo?'All activity is simulated.':'Tools sync when requested. Background monitoring is not enabled.'}</small><Link href={href('approvals')} className="v3-button v3-primary">Review approvals{pending?` (${pending})`:''}</Link><div className="v3-quick-actions"><Link href={href('approvals')}>＋ Prepare action</Link><Link href={href('executions')}>↗ Execution history</Link><Link href={href('connections')}>⌘ Connect tools</Link><Link href={href('automations')}>⚙ Automations</Link></div><div className="v3-automation-summary"><b>Automations</b><p>{data.automations.some(a=>a.enabled)?'Follow-up tasks enabled':'No automations enabled'}</p><small>Runs on refresh/sync · <Link href={href('automations')}>Manage →</Link></small></div></div>;
}
