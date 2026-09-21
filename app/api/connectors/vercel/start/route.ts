import { cookies } from 'next/headers';
import { createClient } from '../../../../../lib/supabase/server';
import { oauthState, secureCookie, UUID } from '../../../../../lib/connectors/oauth';

export async function GET(request:Request) {
  const companyId=new URL(request.url).searchParams.get('companyId')??'', slug=process.env.VERCEL_INTEGRATION_SLUG;
  if(!UUID.test(companyId))return Response.json({error:'A valid company is required.'},{status:400});
  if(!slug)return Response.redirect(new URL(`/company/${companyId}/connections?vercel=setup-required`,request.url));
  const db=await createClient(),{data:claims}=await db.auth.getClaims(),userId=claims?.claims?.sub;if(!userId)return Response.redirect(new URL('/auth',request.url));
  const {data:company}=await db.from('companies').select('id').eq('id',companyId).eq('user_id',userId).maybeSingle();if(!company)return Response.json({error:'Company not found.'},{status:404});
  const state=oauthState(),jar=await cookies();jar.set('vercel_oauth_state',state,{httpOnly:true,secure:secureCookie(request),sameSite:'lax',maxAge:600,path:'/'});jar.set('vercel_oauth_company',companyId,{httpOnly:true,secure:secureCookie(request),sameSite:'lax',maxAge:600,path:'/'});
  return Response.redirect(new URL(`https://vercel.com/integrations/${encodeURIComponent(slug)}/new?state=${encodeURIComponent(state)}`));
}
