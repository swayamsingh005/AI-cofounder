import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCampaignDraft } from '../.v3-test-build/marketing/schema.js';
import { codingProductEvidence, verifiedCodingDestination } from '../.v3-test-build/marketing/destination.js';

const source='https://example.com/company';
const draft={
  title:'CA firm pilot campaign',
  audience:{segment:'Small CA firms',pain:'Manual reconciliation',desiredOutcome:'Faster accurate work',geography:'India'},
  strategy:{positioning:'A reviewable assistant',offer:'Pilot',message:'Reduce repetitive work',cta:'Book a demo',successMetric:'Qualified demos',experiment:'Compare two messages'},
  destination:{kind:'landing_page_blueprint',label:'Landing page blueprint',rationale:'A site is required but has not been built.'},
  claimReview:{verified:['Invoice upload exists'],needsApproval:['Pilot price'],removedSensitiveClaims:[]},
  assets:[
    {assetType:'ad',channel:'linkedin',title:'Ad',content:'Draft ad',creativeBrief:''},
    {assetType:'post',channel:'linkedin',title:'Post',content:'Draft post',creativeBrief:''},
    {assetType:'outreach',channel:'email',title:'Outreach',content:'Draft outreach',creativeBrief:''},
  ],
  leads:[{organization:'Example company',sourceUrl:source,reason:'Matches the public target profile',score:75}],
};

test('marketing packages accept only bounded structured drafts and trusted lead URLs',()=>{
  const parsed=parseCampaignDraft(draft,new Set([source]));
  assert.equal(parsed.assets.length,3);
  assert.equal(parsed.leads[0].score,75);
  assert.equal(parsed.destination.status,'blueprint');
  assert.deepEqual(parsed.claimReview.needsApproval,['Pilot price']);
  assert.equal(parseCampaignDraft({...draft,leads:[{...draft.leads[0],sourceUrl:'https://invented.example'}]},new Set([source])).leads.length,0);
  assert.equal(parseCampaignDraft({...draft,assets:[{...draft.assets[0],assetType:'social post'},...draft.assets.slice(1)]},new Set([source])).assets[0].assetType,'post');
  assert.throws(()=>parseCampaignDraft({...draft,assets:[{...draft.assets[0],assetType:'publish_now'},...draft.assets.slice(1)]},new Set([source])),/invalid asset type/);
});

test('only HTTPS Coding Agent previews become campaign destinations',()=>{
  assert.equal(verifiedCodingDestination({output_payload:{preview:{url:'https://fit-ai-preview.vercel.app'}}})?.url,'https://fit-ai-preview.vercel.app/');
  assert.equal(verifiedCodingDestination({output_payload:{preview:{url:'http://localhost:3000'}}}),null);
  assert.equal(verifiedCodingDestination({output_payload:{preview:{url:'javascript:alert(1)'}}}),null);
  assert.match(codingProductEvidence({input_payload:{objective:'Build onboarding',validation:{summary:'Checks passed'},files:[{path:'app/page.tsx',content:'export default function Page(){}'}]}}),/Build onboarding/);
});
