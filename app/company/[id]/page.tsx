import { notFound } from 'next/navigation';
import { createClient, hasSupabaseConfig } from '../../../lib/supabase/server';
import { loadCompanyContext } from '../../../lib/company-context';
import { getOrCreateDailyBrief } from '../../../lib/daily-brief';
import { loadIntelligence } from '../../../lib/intelligence/data';
import V3Dashboard from '../../../components/v3-dashboard';
import { calculateCompanyPulse } from '../../../lib/intelligence/pulse';

export default async function CompanyOverview({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 if(!hasSupabaseConfig()) notFound();
 const db=await createClient();
 const {data:claims}=await db.auth.getClaims();
 const userId=claims?.claims?.sub;
 if(!userId) notFound();
 const ctx=await loadCompanyContext(db,id);
 if(!ctx) notFound();
 const [data,brief,missions,tasks,memories]=await Promise.all([loadIntelligence(db,id),getOrCreateDailyBrief(db,id,userId),db.from('missions').select('id,objective,progress').eq('company_id',id).eq('status','active'),db.from('tasks').select('id,title,status,priority').eq('company_id',id),db.from('memories').select('kind,assumption_status').eq('company_id',id).limit(1000)]);
 const pulse=calculateCompanyPulse({profile:ctx.profile,tasks:tasks.data??[],memories:memories.data??[]});
 const metadata=claims.claims.user_metadata as Record<string,unknown>|undefined;
 const name=typeof metadata?.full_name==='string'?metadata.full_name:typeof metadata?.name==='string'?metadata.name:'';
 return <V3Dashboard companyId={id} name={ctx.company.name} displayName={name.split(' ')[0]} data={{...data,unavailable:data.unavailable||!!missions.error||!!tasks.error||!!memories.error}} brief={brief} missions={missions.data??[]} tasks={tasks.data??[]} goal={ctx.primaryGoal} pulse={pulse}/>;
}
