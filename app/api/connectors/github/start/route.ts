import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createClient } from '../../../../../lib/supabase/server';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request:Request) {
  const companyId=new URL(request.url).searchParams.get('companyId')??'';
  const clientId=process.env.GITHUB_CLIENT_ID;
  if(!UUID.test(companyId)) return Response.json({error:'A valid company is required.'},{status:400});
  if(!clientId) return Response.redirect(new URL(`/company/${companyId}/connections?github=setup-required`,request.url));
  const db=await createClient(), {data:claims}=await db.auth.getClaims(), userId=claims?.claims?.sub;
  if(!userId) return Response.redirect(new URL('/auth',request.url));
  const {data:company}=await db.from('companies').select('id').eq('id',companyId).eq('user_id',userId).maybeSingle();
  if(!company) return Response.json({error:'Company not found.'},{status:404});
  const state=randomBytes(32).toString('base64url'), jar=await cookies();
  const secure=new URL(request.url).protocol==='https:';
  jar.set('github_oauth_state',state,{httpOnly:true,secure,sameSite:'lax',maxAge:600,path:'/'});
  jar.set('github_oauth_company',companyId,{httpOnly:true,secure,sameSite:'lax',maxAge:600,path:'/'});
  const callback=new URL('/api/connectors/github/callback',request.url).toString();
  const authorize=new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id',clientId); authorize.searchParams.set('redirect_uri',callback); authorize.searchParams.set('state',state); authorize.searchParams.set('scope','repo read:user');
  return Response.redirect(authorize);
}
