import { NextResponse } from 'next/server';
import { createClient, hasSupabaseConfig } from '../../../../lib/supabase/server';
import { loadCompanyContext } from '../../../../lib/company-context';
import { generateMarketingCampaign } from '../../../../lib/marketing/generator';
import { MARKETING_CHANNELS } from '../../../../lib/marketing/schema';
import { codingProductEvidence, verifiedCodingDestination } from '../../../../lib/marketing/destination';

export const maxDuration=300;

async function authenticated(request:Request) {
  if(!hasSupabaseConfig()) throw new Error('Marketing storage is not configured.');
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin) throw new Error('Cross-origin request rejected.');
  const db=await createClient(), {data:claims}=await db.auth.getClaims(), userId=claims?.claims?.sub;
  if(!userId) throw new Error('Sign in first.');
  return {db,userId};
}

export async function POST(request:Request) {
  try {
    const raw=await request.text();
    if(raw.length>6000) return NextResponse.json({error:'Request is too large.'},{status:413});
    const body=JSON.parse(raw) as Record<string,unknown>;
    const companyId=typeof body.companyId==='string'?body.companyId:'', objective=typeof body.objective==='string'?body.objective.trim():'', audience=typeof body.audience==='string'?body.audience.trim():'';
    const channels=Array.isArray(body.channels)?body.channels.filter((item):item is string=>typeof item==='string'&&(MARKETING_CHANNELS as readonly string[]).includes(item)).slice(0,5):[];
    if(!companyId||objective.length<10||objective.length>500||audience.length<3||audience.length>500||!channels.length) return NextResponse.json({error:'Add a clear objective, audience and at least one channel.'},{status:400});
    const {db,userId}=await authenticated(request);
    const {data:company}=await db.from('companies').select('id').eq('id',companyId).eq('user_id',userId).maybeSingle();
    if(!company) return NextResponse.json({error:'Company not found.'},{status:404});
    const [context,codingResult]=await Promise.all([
      loadCompanyContext(db,companyId),
      db.from('ai_actions').select('output_payload,input_payload').eq('company_id',companyId).eq('user_id',userId).eq('provider','github').eq('action_type','github.create_pull_request').in('status',['completed','awaiting_approval']).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    ]);
    if(!context) return NextResponse.json({error:'Company context is unavailable.'},{status:404});
    const codingDestination=verifiedCodingDestination(codingResult.data as {output_payload?:Record<string,unknown>;input_payload?:Record<string,unknown>}|null);
    const codingAction=codingResult.data as {output_payload?:Record<string,unknown>;input_payload?:Record<string,unknown>}|null;
    const draft=await generateMarketingCampaign({objective,audience,channels,context,codingDestination,productEvidence:codingProductEvidence(codingAction)});
    const {data:campaign,error}=await db.from('marketing_campaigns').insert({company_id:companyId,user_id:userId,title:draft.title,objective,audience:draft.audience,strategy:{...draft.strategy,conversionDestination:draft.destination,claimReview:draft.claimReview},channels,status:'draft',currency:context.profile?.targetGeography?.toLowerCase().includes('india')?'INR':'USD'}).select('id').single();
    if(error||!campaign) throw new Error('The campaign could not be saved.');
    const [assetsResult,leadsResult]=await Promise.all([
      db.from('marketing_assets').insert(draft.assets.map(asset=>({company_id:companyId,user_id:userId,campaign_id:campaign.id,asset_type:asset.assetType,channel:asset.channel,title:asset.title,content:asset.content,creative_brief:asset.creativeBrief,status:'draft'}))),
      draft.leads.length?db.from('marketing_leads').insert(draft.leads.map(lead=>({company_id:companyId,user_id:userId,campaign_id:campaign.id,organization:lead.organization,source_url:lead.sourceUrl,reason:lead.reason,score:lead.score,status:'discovered'}))):Promise.resolve({error:null}),
    ]);
    if(assetsResult.error||leadsResult.error) { await db.from('marketing_campaigns').delete().eq('id',campaign.id); throw new Error('The campaign package could not be saved completely.'); }
    await db.from('activity_events').insert({company_id:companyId,user_id:userId,kind:'marketing_campaign_created',title:`Marketing Agent drafted: ${draft.title}`});
    return NextResponse.json({campaignId:campaign.id});
  } catch(error) {
    const message=error instanceof Error?error.message:'The Marketing Agent could not create this campaign.';
    console.error('[api/company/marketing] campaign generation failed',{name:error instanceof Error?error.name:'UnknownError',message:message.slice(0,300)});
    return NextResponse.json({error:/configured|Sign in|Cross-origin|not found|clear objective|could not be saved|could not create|incomplete asset|invalid asset|too much content/i.test(message)?message:'The Marketing Agent could not create this campaign. Try again.'},{status:400});
  }
}

export async function PATCH(request:Request) {
  try {
    const raw=await request.text(); if(raw.length>2000) return NextResponse.json({error:'Request is too large.'},{status:413});
    const body=JSON.parse(raw) as Record<string,unknown>, companyId=typeof body.companyId==='string'?body.companyId:'', campaignId=typeof body.campaignId==='string'?body.campaignId:'', status=body.status;
    if(!companyId||!campaignId||!['approved','paused','archived'].includes(String(status))) return NextResponse.json({error:'Invalid campaign update.'},{status:400});
    const {db,userId}=await authenticated(request);
    const {data,error}=await db.from('marketing_campaigns').update({status,updated_at:new Date().toISOString()}).eq('id',campaignId).eq('company_id',companyId).eq('user_id',userId).select('id').maybeSingle();
    if(error||!data) return NextResponse.json({error:'Campaign not found.'},{status:404});
    if(status==='approved') await db.from('marketing_assets').update({status:'approved',updated_at:new Date().toISOString()}).eq('campaign_id',campaignId).eq('company_id',companyId).eq('user_id',userId).eq('status','draft');
    return NextResponse.json({ok:true});
  } catch { return NextResponse.json({error:'Campaign update failed.'},{status:400}); }
}
