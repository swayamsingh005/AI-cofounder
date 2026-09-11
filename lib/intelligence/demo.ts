import type { IntelligenceData } from './data';
const date='2026-09-11T10:00:00.000Z';
export const demoIntelligence:IntelligenceData={
 unavailable:false,pulse:null,syncs:[],runs:[],
 connections:['github','posthog','stripe','notion'].map((provider,i)=>({id:`demo-tool-${i}`,provider,status:'connected',created_at:date,last_sync_at:date,metadata:{repository:provider==='github'?'demo/tallygenie':undefined}})),
 insights:[{id:'demo-insight',title:'Signup conversion dropped after the onboarding update',description:'Simulated conversion fell from 24% to 18.6%. Investigate the onboarding flow before increasing acquisition spend; timing alone does not prove causation.',status:'new',severity:'high',created_at:date,recommended_action:'Review the onboarding form and run a controlled test',evidence:[{source:'Demo PostHog',previous:24,current:18.6,relative_change:'-22.5%'}]}],
 investigations:[{id:'demo-investigation',title:'Why did signup conversion decline?',status:'completed',hypothesis:'The additional onboarding fields may be increasing friction.',conclusion:'Demo hypothesis only. Compare step-level funnel data and run an experiment before claiming causation.',recommended_action:'Review the proposed onboarding experiment',created_at:date,evidence:[{source:'Simulated funnel',note:'No live analytics queried'}]}],
 actions:[{id:'demo-action',title:'Review onboarding experiment',description:'A simulated approval flow. No real code will be deployed.',provider:'internal',action_type:'create_task',risk_level:'low',status:'awaiting_approval',created_at:date}],
 automations:[{id:'demo-automation',name:'Create follow-up tasks from insights',enabled:true,created_at:date}],
 events:[{id:'demo-event-1',title:'Onboarding experiment prepared for review',source:'Demo GitHub',created_at:date},{id:'demo-event-2',title:'New signups increased 18% in the sample',source:'Demo PostHog',created_at:date},{id:'demo-event-3',title:'Added AI compliance notes',source:'Demo Notion',created_at:date},{id:'demo-event-4',title:'Sample payment received: ₹49,999',source:'Demo Stripe',created_at:date}],
};
