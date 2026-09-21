import { createClient } from '../../../../../lib/supabase/server';
import { readConnectorCredential } from '../../../../../lib/connectors/credentials';
import { UUID } from '../../../../../lib/connectors/oauth';

export async function GET(request:Request) {
  const companyId=new URL(request.url).searchParams.get('companyId')??'';if(!UUID.test(companyId))return Response.json({error:'Invalid company.'},{status:400});
  const db=await createClient(),{data:claims}=await db.auth.getClaims(),userId=claims?.claims?.sub;if(!userId)return Response.json({error:'Sign in required.'},{status:401});
  const {data:connection}=await db.from('connections').select('id,metadata').eq('company_id',companyId).eq('user_id',userId).eq('provider','vercel').eq('connection_type','oauth').maybeSingle();if(!connection)return Response.json({error:'Connect Vercel first.'},{status:404});
  const token=await readConnectorCredential(connection.id,userId,'vercel');if(!token)return Response.json({error:'Reconnect Vercel.'},{status:401});
  const teamId=String(connection.metadata?.team_id??''),endpoint=new URL('https://api.vercel.com/v9/projects');if(teamId)endpoint.searchParams.set('teamId',teamId);endpoint.searchParams.set('limit','100');
  const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});const result=await response.json() as {projects?:{id?:string;name?:string;framework?:string}[]};if(!response.ok)return Response.json({error:'Vercel projects could not be loaded. Reconnect if access expired.'},{status:502});
  return Response.json({projects:(result.projects??[]).map(p=>({id:p.id,name:p.name,framework:p.framework})).filter(p=>p.id)});
}
