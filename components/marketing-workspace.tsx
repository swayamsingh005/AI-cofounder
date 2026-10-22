'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MARKETING_CHANNELS } from '../lib/marketing/schema';

type Campaign={id:string;title:string;objective:string;audience:Record<string,string>;strategy:Record<string,string>;channels:string[];status:string;created_at:string};
type Asset={id:string;campaign_id:string;asset_type:string;channel:string;title:string;content:string;creative_brief:string|null;status:string};
type Lead={id:string;campaign_id:string;organization:string;source_url:string;reason:string;score:number;status:string};
const LABELS:Record<string,string>={linkedin:'LinkedIn',instagram:'Instagram',x:'X',email:'Email',google_ads:'Google Ads',meta_ads:'Meta Ads',landing_page:'Landing page'};

export default function MarketingWorkspace({companyId,campaigns,assets,leads,unavailable=false}:{companyId:string;campaigns:Campaign[];assets:Asset[];leads:Lead[];unavailable?:boolean}) {
  const router=useRouter();
  const [objective,setObjective]=useState(''),[audience,setAudience]=useState(''),[channels,setChannels]=useState<string[]>(['linkedin','email']),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function generate(event:React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const response=await fetch('/api/company/marketing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId,objective,audience,channels})}); const data=await response.json(); if(!response.ok)throw new Error(data.error??'Campaign generation failed.'); setObjective(''); setMessage('Campaign package created. Review every asset before approving it.'); router.refresh(); }
    catch(error){setMessage(error instanceof Error?error.message:'Campaign generation failed.');} finally{setBusy(false);}
  }
  async function update(campaignId:string,status:string) {
    setBusy(true);setMessage('');
    try {const response=await fetch('/api/company/marketing',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId,campaignId,status})});const data=await response.json();if(!response.ok)throw new Error(data.error??'Campaign update failed.');setMessage(status==='approved'?'Campaign and drafts approved. Nothing has been published or sent.':'Campaign updated.');router.refresh();}
    catch(error){setMessage(error instanceof Error?error.message:'Campaign update failed.');}finally{setBusy(false);}
  }
  return <section className="v3-module marketing-workspace">
    <div className="v3-page-heading"><div><span className="v3-eyebrow">AI MARKETING TEAM</span><h1>Marketing Agent</h1><p>Plan campaigns, create channel-ready assets and discover evidence-linked lead candidates.</p></div><span className="v3-badge">Approval protected</span></div>
    {unavailable&&<p className="v3-error" role="alert">The Marketing workspace database is not available yet.</p>}
    <div className="marketing-summary">
      <article className="v3-card"><small>Campaigns</small><strong>{campaigns.length}</strong><span>{campaigns.filter(item=>item.status==='draft').length} awaiting review</span></article>
      <article className="v3-card"><small>Content assets</small><strong>{assets.length}</strong><span>ads, posts, emails and outreach</span></article>
      <article className="v3-card"><small>Lead candidates</small><strong>{leads.length}</strong><span>public sources only</span></article>
      <article className="v3-card"><small>External actions</small><strong>0</strong><span>nothing sent or published</span></article>
    </div>
    <form className="v3-card v3-form marketing-builder" onSubmit={generate}>
      <div><span className="v3-eyebrow">NEW CAMPAIGN</span><h2>Tell the agent what outcome you want</h2><p>It will use company memory and public research to generate a campaign, ads, posts, emails, outreach and landing-page copy.</p></div>
      <label>Campaign objective<textarea required minLength={10} maxLength={500} value={objective} onChange={event=>setObjective(event.target.value)} placeholder="Generate 20 qualified demo requests from Indian CA firms in 30 days."/></label>
      <label>Target audience<input required minLength={3} maxLength={500} value={audience} onChange={event=>setAudience(event.target.value)} placeholder="Owners of 5–30 person CA firms using Tally in India"/></label>
      <fieldset><legend>Channels</legend><div className="marketing-channel-grid">{MARKETING_CHANNELS.map(channel=><label key={channel}><input type="checkbox" checked={channels.includes(channel)} onChange={event=>setChannels(current=>event.target.checked?[...current,channel]:current.filter(item=>item!==channel))}/><span>{LABELS[channel]}</span></label>)}</div></fieldset>
      <button className="v3-primary" disabled={busy||!channels.length}>{busy?'Marketing Agent is researching and creating…':'Generate complete campaign'}</button>
      {message&&<p role="status" className={/failed|not available|could not/i.test(message)?'v3-error':'v3-feedback'}>{message}</p>}
    </form>
    <div className="v3-card-heading marketing-section-heading"><h2>Campaign workspace</h2><span>{campaigns.length?`${campaigns.length} campaign${campaigns.length===1?'':'s'}`:'No campaigns yet'}</span></div>
    {campaigns.map(campaign=>{const campaignAssets=assets.filter(asset=>asset.campaign_id===campaign.id),campaignLeads=leads.filter(lead=>lead.campaign_id===campaign.id);return <article className="v3-card marketing-campaign" key={campaign.id}>
      <div className="v3-card-heading"><div><span className="v3-badge">{campaign.status}</span><h2>{campaign.title}</h2></div><small>{campaign.channels.map(channel=>LABELS[channel]??channel).join(' · ')}</small></div>
      <p><b>Objective:</b> {campaign.objective}</p>
      <div className="marketing-strategy"><div><small>Audience</small><p>{campaign.audience?.segment}</p></div><div><small>Positioning</small><p>{campaign.strategy?.positioning}</p></div><div><small>Offer</small><p>{campaign.strategy?.offer}</p></div><div><small>Success metric</small><p>{campaign.strategy?.successMetric}</p></div></div>
      <details open={campaign.status==='draft'}><summary>Review {campaignAssets.length} generated assets</summary><div className="marketing-assets">{campaignAssets.map(asset=><article key={asset.id}><div><span className="v3-badge">{asset.asset_type.replaceAll('_',' ')}</span><small>{asset.channel} · {asset.status}</small></div><h3>{asset.title}</h3><pre>{asset.content}</pre>{asset.creative_brief&&<details><summary>Creative direction</summary><p>{asset.creative_brief}</p></details>}</article>)}</div></details>
      {!!campaignLeads.length&&<details><summary>Review {campaignLeads.length} public lead candidates</summary><div className="marketing-leads">{campaignLeads.map(lead=><a href={lead.source_url} target="_blank" rel="noreferrer" key={lead.id}><strong>{lead.organization}</strong><span>{lead.score}/100</span><small>{lead.reason}</small></a>)}</div></details>}
      <div className="v3-button-row">{campaign.status==='draft'&&<button className="v3-primary" disabled={busy} onClick={()=>update(campaign.id,'approved')}>Approve campaign drafts</button>}{!['archived','active'].includes(campaign.status)&&<button disabled={busy} onClick={()=>update(campaign.id,'archived')}>Archive</button>}<small>Approval saves your decision only. Publishing and outreach stay disabled until connectors are configured.</small></div>
    </article>})}
    {!campaigns.length&&!unavailable&&<article className="v3-card v3-empty"><h2>No campaign yet</h2><p>Create the first campaign above. The agent will prepare real working drafts rather than publishing anything automatically.</p></article>}
  </section>;
}
