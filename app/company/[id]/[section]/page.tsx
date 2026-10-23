import { notFound } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { loadIntelligence } from '../../../../lib/intelligence/data';
import V3Module from '../../../../components/v3-module';
import AgentsPanel from '../../../../components/agents-panel';
import type { AgentRun } from '../../../../lib/agents/runtime';
import MarketingWorkspace from '../../../../components/marketing-workspace';
import { verifiedCodingDestination } from '../../../../lib/marketing/destination';
import ResearchWorkspace from '../../../../components/research-workspace';
export default async function IntelligencePage({params}:{params:Promise<{id:string;section:string}>}) {
  const {id,section}=await params;
  if(!['agents','coding','marketing','research','connections','insights','investigations','approvals','automations','executions','events'].includes(section)) notFound();
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
  if (section === 'research') {
    const runs=await db.from('agent_runs').select('*').eq('company_id',id).eq('agent_id','research').order('created_at',{ascending:false}).limit(20);
    return <ResearchWorkspace companyId={id} runs={(runs.data??[]) as AgentRun[]}/>;
  }
  if(section==='marketing') {
    const [campaigns,assets,leads,coding]=await Promise.all([
      db.from('marketing_campaigns').select('id,title,objective,audience,strategy,channels,status,created_at').eq('company_id',id).order('created_at',{ascending:false}).limit(20),
      db.from('marketing_assets').select('id,campaign_id,asset_type,channel,title,content,creative_brief,status').eq('company_id',id).order('created_at',{ascending:true}).limit(200),
      db.from('marketing_leads').select('id,campaign_id,organization,source_url,reason,score,status').eq('company_id',id).order('score',{ascending:false}).limit(200),
      db.from('ai_actions').select('output_payload,input_payload').eq('company_id',id).eq('provider','github').eq('action_type','github.create_pull_request').in('status',['completed','awaiting_approval']).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    ]);
    return <MarketingWorkspace companyId={id} campaigns={campaigns.data??[]} assets={assets.data??[]} leads={leads.data??[]} codingDestination={verifiedCodingDestination(coding.data as {output_payload?:Record<string,unknown>;input_payload?:Record<string,unknown>}|null)} unavailable={!!campaigns.error||!!assets.error||!!leads.error}/>;
  }
  return <V3Module companyId={id} section={section} data={await loadIntelligence(db,id)}/>;
}
