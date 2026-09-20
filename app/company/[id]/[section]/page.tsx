import { notFound } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { loadIntelligence } from '../../../../lib/intelligence/data';
import V3Module from '../../../../components/v3-module';
import AgentsPanel from '../../../../components/agents-panel';
import type { AgentRun } from '../../../../lib/agents/runtime';
export default async function IntelligencePage({params}:{params:Promise<{id:string;section:string}>}) {
  const {id,section}=await params;
  if(!['agents','connections','insights','investigations','approvals','automations','executions','events'].includes(section)) notFound();
  const db=await createClient();
  const {data:claims}=await db.auth.getClaims();
  if(!claims?.claims?.sub) notFound();
  const {data:company}=await db.from('companies').select('id').eq('id',id).eq('user_id',claims.claims.sub).maybeSingle();
  if(!company) notFound();
  if (section === 'agents') {
    const [runs, connections] = await Promise.all([
      db.from('agent_runs').select('*').eq('company_id',id).order('created_at',{ascending:false}).limit(30),
      db.from('connections').select('id,provider,status,connection_type,created_at').eq('company_id',id),
    ]);
    return <AgentsPanel companyId={id} runs={(runs.data ?? []) as AgentRun[]} connections={connections.data ?? []} unavailable={!!runs.error || !!connections.error}/>;
  }
  return <V3Module companyId={id} section={section} data={await loadIntelligence(db,id)}/>;
}
