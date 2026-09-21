import { cookies } from 'next/headers';
import { createClient } from '../../../../../lib/supabase/server';
import { saveConnectorCredential } from '../../../../../lib/connectors/credentials';

export async function GET(request:Request) {
  const url=new URL(request.url),jar=await cookies(),companyId=jar.get('vercel_oauth_company')?.value??'',expected=jar.get('vercel_oauth_state')?.value;jar.delete('vercel_oauth_state');jar.delete('vercel_oauth_company');
  const fail=(reason:string)=>Response.redirect(new URL(`/company/${companyId}/connections?vercel=${reason}`,request.url));if(!companyId||!expected||url.searchParams.get('state')!==expected)return fail('invalid-state');
  const code=url.searchParams.get('code'),clientId=process.env.VERCEL_CLIENT_ID,secret=process.env.VERCEL_CLIENT_SECRET;if(!code||!clientId||!secret)return fail('authorization-failed');
  const db=await createClient(),{data:claims}=await db.auth.getClaims(),userId=claims?.claims?.sub;if(!userId)return Response.redirect(new URL('/auth',request.url));
  const {data:company}=await db.from('companies').select('id').eq('id',companyId).eq('user_id',userId).maybeSingle();if(!company)return fail('company-not-found');
  try {
    const response=await fetch('https://api.vercel.com/v2/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:secret,code,redirect_uri:new URL('/api/connectors/vercel/callback',request.url).toString()}),cache:'no-store',signal:AbortSignal.timeout(15000)});const token=await response.json() as {access_token?:string;team_id?:string;user_id?:string};if(!response.ok||!token.access_token)throw new Error('exchange');
    const userResponse=await fetch('https://api.vercel.com/v2/user',{headers:{Authorization:`Bearer ${token.access_token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});const profile=await userResponse.json() as {user?:{name?:string;username?:string}};if(!userResponse.ok)throw new Error('profile');
    const {data:connection,error}=await db.from('connections').upsert({company_id:companyId,user_id:userId,provider:'vercel',display_name:profile.user?.name??profile.user?.username??'Vercel',status:'connected',connection_type:'oauth',permissions:['projects:read','deployments:read'],metadata:{team_id:token.team_id??'',vercel_user_id:token.user_id??''},updated_at:new Date().toISOString()},{onConflict:'company_id,provider'}).select('id').single();if(error||!connection)throw new Error('connection');
    await saveConnectorCredential(connection.id,userId,'vercel',token.access_token);return Response.redirect(new URL(`/company/${companyId}/connections?vercel=connected`,request.url));
  } catch { return fail('authorization-failed'); }
}
