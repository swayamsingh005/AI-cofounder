import { object, text } from '../agents/schema';

export const MARKETING_CHANNELS = ['linkedin','instagram','x','email','google_ads','meta_ads','landing_page'] as const;
export type MarketingChannel = typeof MARKETING_CHANNELS[number];
export type MarketingAssetType = 'ad'|'post'|'email'|'outreach'|'landing_page'|'reel'|'creative_brief';

export type MarketingCampaignDraft = {
  title:string;
  audience:{segment:string;pain:string;desiredOutcome:string;geography:string};
  strategy:{positioning:string;offer:string;message:string;cta:string;successMetric:string;experiment:string};
  assets:{assetType:MarketingAssetType;channel:string;title:string;content:string;creativeBrief:string}[];
  leads:{organization:string;sourceUrl:string;reason:string;score:number}[];
};

const ASSET_TYPES = new Set<MarketingAssetType>(['ad','post','email','outreach','landing_page','reel','creative_brief']);
export function parseCampaignDraft(value:unknown, allowedSourceUrls:Set<string>):MarketingCampaignDraft {
  const root=object(value);
  const audience=object(root.audience), strategy=object(root.strategy);
  if(!Array.isArray(root.assets)||root.assets.length<3||root.assets.length>10) throw new Error('The Marketing Agent returned an incomplete asset package.');
  const assets=root.assets.map(item=>{
    const asset=object(item), assetType=asset.assetType;
    if(typeof assetType!=='string'||!ASSET_TYPES.has(assetType as MarketingAssetType)) throw new Error('The Marketing Agent returned an invalid asset type.');
    return {assetType:assetType as MarketingAssetType,channel:text(asset.channel,60),title:text(asset.title,200),content:text(asset.content,8000),creativeBrief:typeof asset.creativeBrief==='string'?asset.creativeBrief.slice(0,4000):''};
  });
  const leads=Array.isArray(root.leads)?root.leads.slice(0,12).map(item=>{
    const lead=object(item), sourceUrl=text(lead.sourceUrl,1000);
    if(!allowedSourceUrls.has(sourceUrl)) throw new Error('The Marketing Agent referenced an unknown lead source.');
    const score=Number(lead.score);
    if(!Number.isInteger(score)||score<0||score>100) throw new Error('The Marketing Agent returned an invalid lead score.');
    return {organization:text(lead.organization,200),sourceUrl,reason:text(lead.reason,1000),score};
  }):[];
  return {
    title:text(root.title,160),
    audience:{segment:text(audience.segment,500),pain:text(audience.pain,1000),desiredOutcome:text(audience.desiredOutcome,1000),geography:text(audience.geography,200)},
    strategy:{positioning:text(strategy.positioning,1500),offer:text(strategy.offer,1000),message:text(strategy.message,1500),cta:text(strategy.cta,500),successMetric:text(strategy.successMetric,500),experiment:text(strategy.experiment,1000)},
    assets,leads,
  };
}
