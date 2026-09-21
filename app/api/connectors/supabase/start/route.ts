import { cookies } from 'next/headers';
import { createClient } from '../../../../../lib/supabase/server';
import { oauthState, pkceChallenge, pkceVerifier, secureCookie, UUID } from '../../../../../lib/connectors/oauth';

export async function GET(request:Request) {
  const companyId=new URL(request.url).searchParams.get('companyId')??'', clientId=process.env.SUPABASE_OAUTH_CLIENT_ID;
  if(!UUID.test(companyId)) return Response.json({error:'A valid company is required.'},{status:400});
  if(!clientId) return Response.redirect(new URL(`/company/${companyId}/connections?supabase=setup-required`,request.url));
  const db=await createClient(), {data:claims}=await db.auth.getClaims(), userId=claims?.claims?.sub;
  if(!userId) return Response.redirect(new URL('/auth',request.url));
  const {data:company}=await db.from('companies').select('id').eq('id',companyId).eq('user_id',userId).maybeSingle();
  if(!company) return Response.json({error:'Company not found.'},{status:404});
  const state=oauthState(), verifier=pkceVerifier(), jar=await cookies(), secure=secureCookie(request);
  jar.set('supabase_oauth_state',state,{httpOnly:true,secure,sameSite:'lax',maxAge:600,path:'/'});
  jar.set('supabase_oauth_company',companyId,{httpOnly:true,secure,sameSite:'lax',maxAge:600,path:'/'});
  jar.set('supabase_oauth_verifier',verifier,{httpOnly:true,secure,sameSite:'lax',maxAge:600,path:'/'});
  const authorize=new URL('https://api.supabase.com/v1/oauth/authorize');
  authorize.searchParams.set('client_id',clientId); authorize.searchParams.set('response_type','code'); authorize.searchParams.set('state',state);
  authorize.searchParams.set('redirect_uri',new URL('/api/connectors/supabase/callback',request.url).toString());
  authorize.searchParams.set('code_challenge',pkceChallenge(verifier)); authorize.searchParams.set('code_challenge_method','S256');
  return Response.redirect(authorize);
}
