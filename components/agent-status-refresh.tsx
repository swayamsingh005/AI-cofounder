'use client';
import { useIntelligence } from './v3-controls';
export default function AgentStatusRefresh({ companyId }: { companyId: string }) {
  const { run, busy, message, failed } = useIntelligence(companyId);
  return <div className="v3-button-row"><button className="v3-button" disabled={busy} onClick={() => run({ op: 'agent_status' })}>Refresh run status</button>{message && <p role={failed ? 'alert' : 'status'}>{message}</p>}</div>;
}
