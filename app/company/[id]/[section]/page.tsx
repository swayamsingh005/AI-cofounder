import { notFound } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { loadIntelligence } from '../../../../lib/intelligence/data';
import V3Module from '../../../../components/v3-module';
export default async function IntelligencePage({params}:{params:Promise<{id:string;section:string}>}) {
  const {id,section}=await params;
  if(!['connections','insights','investigations','approvals','automations','executions','events'].includes(section)) notFound();
  const db=await createClient();
  const {data:claims}=await db.auth.getClaims();
  if(!claims?.claims?.sub) notFound();
  const {data:company}=await db.from('companies').select('id').eq('id',id).eq('user_id',claims.claims.sub).maybeSingle();
  if(!company) notFound();
  return <V3Module companyId={id} section={section} data={await loadIntelligence(db,id)}/>;
}
