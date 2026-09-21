import { cookies } from 'next/headers';
import { createClient } from '../../../../../lib/supabase/server';
import { saveConnectorCredential } from '../../../../../lib/connectors/credentials';

export async function GET(request:Request) {
  const url=new URL(request.url), jar=await cookies(), companyId=jar.get('supabase_oauth_company')?.value??'', expected=jar.get('supabase_oauth_state')?.value, verifier=jar.get('supabase_oauth_verifier')?.value??'';
  jar.delete('supabase_oauth_state'); jar.delete('supabase_oauth_company'); jar.delete('supabase_oauth_verifier');
  const fail=(reason:string)=>Response.redirect(new URL(`/company/${companyId}/connections?supabase=${reason}`,request.url));
  if(!companyId||!expected||!verifier||url.searchParams.get('state')!==expected) return fail('invalid-state');
  const code=url.searchParams.get('code'), clientId=process.env.SUPABASE_OAUTH_CLIENT_ID, secret=process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  if(!code||!clientId||!secret) return fail('authorization-failed');
  const db=await createClient(), {data:claims}=await db.auth.getClaims(), userId=claims?.claims?.sub;
  if(!userId) return Response.redirect(new URL('/auth',request.url));
  const {data:company}=await db.from('companies').select('id').eq('id',companyId).eq('user_id',userId).maybeSingle(); if(!company)return fail('company-not-found');
  try {
    const tokenResponse=await fetch('https://api.supabase.com/v1/oauth/token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded',Authorization:`Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:new URL('/api/connectors/supabase/callback',request.url).toString(),code_verifier:verifier}),cache:'no-store',signal:AbortSignal.timeout(15000)});
    const token=await tokenResponse.json() as {access_token?:string;refresh_token?:string;expires_in?:number}; if(!tokenResponse.ok||!token.access_token)throw new Error('exchange');
    const orgsResponse=await fetch('https://api.supabase.com/v1/organizations',{headers:{Authorization:`Bearer ${token.access_token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
    const orgs=await orgsResponse.json() as {name?:string;slug?:string}[]; if(!orgsResponse.ok)throw new Error('profile');
    const {data:connection,error}=await db.from('connections').upsert({company_id:companyId,user_id:userId,provider:'supabase',display_name:orgs[0]?.name??'Supabase',status:'connected',connection_type:'oauth',permissions:['projects:read','environment:read','database:read'],metadata:{organization:orgs[0]?.slug??'',token_expires_at:Date.now()+(token.expires_in??3600)*1000},updated_at:new Date().toISOString()},{onConflict:'company_id,provider'}).select('id').single();
    if(error||!connection)throw new Error('connection');
    await saveConnectorCredential(connection.id,userId,'supabase',JSON.stringify({access_token:token.access_token,refresh_token:token.refresh_token??''}));
    return Response.redirect(new URL(`/company/${companyId}/connections?supabase=connected`,request.url));
  } catch { return fail('authorization-failed'); }
}
