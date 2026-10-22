create index marketing_campaigns_user_id_idx on public.marketing_campaigns(user_id);
create index marketing_assets_user_id_idx on public.marketing_assets(user_id);
create index marketing_assets_company_campaign_idx on public.marketing_assets(company_id,campaign_id);
create index marketing_leads_user_id_idx on public.marketing_leads(user_id);
create index marketing_leads_company_campaign_idx on public.marketing_leads(company_id,campaign_id);
