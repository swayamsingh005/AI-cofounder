import { object, text } from '../agents/schema';

export const MARKETING_CHANNELS = ['linkedin','instagram','x','email','google_ads','meta_ads','landing_page'] as const;
export type MarketingChannel = typeof MARKETING_CHANNELS[number];
export type MarketingAssetType = 'ad'|'post'|'email'|'outreach'|'landing_page'|'reel'|'creative_brief';
export type ConversionDestinationKind = 'product_url'|'landing_page_blueprint'|'booking_page'|'whatsapp'|'marketplace_listing'|'store_visit'|'phone_enquiry'|'lead_form'|'none';
export type ConversionDestination = {kind:ConversionDestinationKind;label:string;url:string;rationale:string;status:'verified_preview'|'blueprint'|'non_web'};
export type MarketingClaimReview={verified:string[];needsApproval:string[];removedSensitiveClaims:string[]};

export type MarketingCampaignDraft = {
  title:string;
  audience:{segment:string;pain:string;desiredOutcome:string;geography:string};
  strategy:{positioning:string;offer:string;message:string;cta:string;successMetric:string;experiment:string};
  destination:ConversionDestination;
  claimReview:MarketingClaimReview;
  assets:{assetType:MarketingAssetType;channel:string;title:string;content:string;creativeBrief:string}[];
  leads:{organization:string;sourceUrl:string;reason:string;score:number}[];
};

const ASSET_TYPES = new Set<MarketingAssetType>(['ad','post','email','outreach','landing_page','reel','creative_brief']);
const DESTINATION_TYPES = new Set<ConversionDestinationKind>(['product_url','landing_page_blueprint','booking_page','whatsapp','marketplace_listing','store_visit','phone_enquiry','lead_form','none']);
function assetType(value:unknown):MarketingAssetType {
  const normalized=typeof value==='string'?value.trim().toLowerCase().replace(/[ -]+/g,'_'):'';
  const aliases:Record<string,MarketingAssetType>={social_post:'post',linkedin_post:'post',instagram_post:'post',outreach_message:'outreach',cold_email:'email',landing:'landing_page',landing_page_copy:'landing_page',video_script:'reel',reel_script:'reel'};
  const candidate=aliases[normalized]??normalized;
  if(!ASSET_TYPES.has(candidate as MarketingAssetType)) throw new Error('The Marketing Agent returned an invalid asset type.');
  return candidate as MarketingAssetType;
}
export function parseCampaignDraft(value:unknown, allowedSourceUrls:Set<string>):MarketingCampaignDraft {
  const root=object(value);
  const audience=object(root.audience), strategy=object(root.strategy), rawDestination=root.destination&&typeof root.destination==='object'&&!Array.isArray(root.destination)?root.destination as Record<string,unknown>:{kind:'landing_page_blueprint',label:'Landing page blueprint',rationale:'A conversion page may be required, but no verified destination is available.'};
  if(!Array.isArray(root.assets)||root.assets.length<1||root.assets.length>10) throw new Error('The Marketing Agent returned an incomplete asset package.');
  const assets=root.assets.map(item=>{
    const asset=object(item), type=assetType(asset.assetType);
    return {assetType:type,channel:text(asset.channel,60),title:text(asset.title,200),content:text(asset.content,8000),creativeBrief:typeof asset.creativeBrief==='string'?asset.creativeBrief.slice(0,4000):''};
  });
  const leads=Array.isArray(root.leads)?root.leads.slice(0,12).flatMap(item=>{
    try {
      const lead=object(item), sourceUrl=text(lead.sourceUrl,1000), score=Number(lead.score);
      if(!allowedSourceUrls.has(sourceUrl)||!Number.isInteger(score)||score<0||score>100)return [];
      return [{organization:text(lead.organization,200),sourceUrl,reason:text(lead.reason,1000),score}];
    } catch { return []; }
  }):[];
  const kind=typeof rawDestination.kind==='string'&&DESTINATION_TYPES.has(rawDestination.kind as ConversionDestinationKind)?rawDestination.kind as ConversionDestinationKind:'landing_page_blueprint';
  const rawReview=root.claimReview&&typeof root.claimReview==='object'&&!Array.isArray(root.claimReview)?root.claimReview as Record<string,unknown>:{};
  const list=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&item.trim().length>0).slice(0,12).map(item=>item.slice(0,500)):[];
  return {
    title:text(root.title,160),
    audience:{segment:text(audience.segment,500),pain:text(audience.pain,1000),desiredOutcome:text(audience.desiredOutcome,1000),geography:text(audience.geography,200)},
    strategy:{positioning:text(strategy.positioning,1500),offer:text(strategy.offer,1000),message:text(strategy.message,1500),cta:text(strategy.cta,500),successMetric:text(strategy.successMetric,500),experiment:text(strategy.experiment,1000)},
    destination:{kind,label:text(rawDestination.label,200),url:'',rationale:text(rawDestination.rationale,1000),status:kind==='landing_page_blueprint'||kind==='product_url'?'blueprint':'non_web'},
    claimReview:{verified:list(rawReview.verified),needsApproval:list(rawReview.needsApproval),removedSensitiveClaims:list(rawReview.removedSensitiveClaims)},
    assets,leads,
  };
}
