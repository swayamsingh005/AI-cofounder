import { cookies } from 'next/headers';
import { createClient } from '../../../../../lib/supabase/server';
import { saveGitHubToken } from '../../../../../lib/connectors/credentials';

export async function GET(request:Request) {
  const url=new URL(request.url), jar=await cookies(), companyId=jar.get('github_oauth_company')?.value??'', expected=jar.get('github_oauth_state')?.value;
  jar.delete('github_oauth_state'); jar.delete('github_oauth_company');
  const fail=(reason:string)=>Response.redirect(new URL(`/company/${companyId}/connections?github=${reason}`,request.url));
  if(!companyId || !expected || url.searchParams.get('state')!==expected) return fail('invalid-state');
  const code=url.searchParams.get('code'), clientId=process.env.GITHUB_CLIENT_ID, clientSecret=process.env.GITHUB_CLIENT_SECRET;
  if(!code || !clientId || !clientSecret) return fail('authorization-failed');
  const db=await createClient(), {data:claims}=await db.auth.getClaims(), userId=claims?.claims?.sub;
  if(!userId) return Response.redirect(new URL('/auth',request.url));
  const {data:company}=await db.from('companies').select('id').eq('id',companyId).eq('user_id',userId).maybeSingle();
  if(!company) return fail('company-not-found');
  try {
    const tokenResponse=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','User-Agent':'AI-Co-Founder'},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,code,redirect_uri:new URL('/api/connectors/github/callback',request.url).toString()}),cache:'no-store',signal:AbortSignal.timeout(12000)});
    const tokenBody=await tokenResponse.json() as {access_token?:string;error?:string};
    if(!tokenResponse.ok || !tokenBody.access_token) throw new Error(tokenBody.error??'token_exchange_failed');
    const userResponse=await fetch('https://api.github.com/user',{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${tokenBody.access_token}`,'User-Agent':'AI-Co-Founder'},cache:'no-store',signal:AbortSignal.timeout(12000)});
    const githubUser=await userResponse.json() as {login?:string;id?:number};
    if(!userResponse.ok || !githubUser.login) throw new Error('profile_failed');
    const {data:connection,error}=await db.from('connections').upsert({company_id:companyId,user_id:userId,provider:'github',display_name:githubUser.login,status:'connected',connection_type:'oauth',permissions:['read','contents:write','pull_requests:write'],metadata:{account:githubUser.login,github_user_id:githubUser.id},updated_at:new Date().toISOString()},{onConflict:'company_id,provider'}).select('id').single();
    if(error || !connection) throw new Error('connection_failed');
    await saveGitHubToken(connection.id,userId,tokenBody.access_token);
    return Response.redirect(new URL(`/company/${companyId}/connections?github=connected`,request.url));
  } catch { return fail('authorization-failed'); }
}
