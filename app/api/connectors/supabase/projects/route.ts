import { createClient } from '../../../../../lib/supabase/server';
import { readConnectorCredential } from '../../../../../lib/connectors/credentials';
import { UUID } from '../../../../../lib/connectors/oauth';

export async function GET(request:Request) {
  const companyId=new URL(request.url).searchParams.get('companyId')??''; if(!UUID.test(companyId))return Response.json({error:'Invalid company.'},{status:400});
  const db=await createClient(),{data:claims}=await db.auth.getClaims(),userId=claims?.claims?.sub;if(!userId)return Response.json({error:'Sign in required.'},{status:401});
  const {data:connection}=await db.from('connections').select('id').eq('company_id',companyId).eq('user_id',userId).eq('provider','supabase').eq('connection_type','oauth').maybeSingle();if(!connection)return Response.json({error:'Connect Supabase first.'},{status:404});
  const saved=await readConnectorCredential(connection.id,userId,'supabase');if(!saved)return Response.json({error:'Reconnect Supabase.'},{status:401});
  const accessToken=(JSON.parse(saved) as {access_token?:string}).access_token;if(!accessToken)return Response.json({error:'Reconnect Supabase.'},{status:401});
  const response=await fetch('https://api.supabase.com/v1/projects',{headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store',signal:AbortSignal.timeout(15000)});const projects=await response.json();
  if(!response.ok)return Response.json({error:'Supabase projects could not be loaded. Reconnect if access expired.'},{status:502});
  return Response.json({projects:(Array.isArray(projects)?projects:[]).map((p:{id?:string;name?:string;region?:string})=>({id:p.id,name:p.name,region:p.region})).filter((p:{id?:string})=>p.id)});
}
