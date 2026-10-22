import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCampaignDraft } from '../.v3-test-build/marketing/schema.js';

const source='https://example.com/company';
const draft={
  title:'CA firm pilot campaign',
  audience:{segment:'Small CA firms',pain:'Manual reconciliation',desiredOutcome:'Faster accurate work',geography:'India'},
  strategy:{positioning:'A reviewable assistant',offer:'Pilot',message:'Reduce repetitive work',cta:'Book a demo',successMetric:'Qualified demos',experiment:'Compare two messages'},
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
  assert.throws(()=>parseCampaignDraft({...draft,leads:[{...draft.leads[0],sourceUrl:'https://invented.example'}]},new Set([source])),/unknown lead source/);
  assert.throws(()=>parseCampaignDraft({...draft,assets:[{...draft.assets[0],assetType:'publish_now'},...draft.assets.slice(1)]},new Set([source])),/invalid asset type/);
});
