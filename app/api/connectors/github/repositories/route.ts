import { createClient } from '../../../../../lib/supabase/server';
import { readGitHubToken } from '../../../../../lib/connectors/credentials';

export async function GET(request:Request) {
  const companyId=new URL(request.url).searchParams.get('companyId')??'', db=await createClient();
  const {data:claims}=await db.auth.getClaims(), userId=claims?.claims?.sub;
  if(!userId) return Response.json({error:'Sign in first.'},{status:401});
  const {data:connection}=await db.from('connections').select('id').eq('company_id',companyId).eq('user_id',userId).eq('provider','github').eq('connection_type','oauth').maybeSingle();
  if(!connection) return Response.json({error:'Connect GitHub first.'},{status:404});
  const token=await readGitHubToken(connection.id,userId);
  if(!token) return Response.json({error:'Reconnect GitHub to continue.'},{status:401});
  const response=await fetch('https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100',{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'User-Agent':'AI-Co-Founder'},cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok) return Response.json({error:'GitHub repositories could not be loaded.'},{status:502});
  const repos=await response.json() as {full_name:string;private:boolean;permissions?:{pull?:boolean}}[];
  return Response.json({repositories:repos.filter(r=>r.permissions?.pull!==false).map(r=>({name:r.full_name,private:r.private}))});
}
