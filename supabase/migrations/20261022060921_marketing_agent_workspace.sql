-- Structured, founder-owned workspace for the Marketing Agent.
-- External publishing and outreach remain separate approval-gated actions.
create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 160),
  objective text not null check (length(objective) between 1 and 500),
  audience jsonb not null default '{}',
  strategy jsonb not null default '{}',
  channels text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','approved','active','paused','completed','archived')),
  budget numeric(14,2),
  currency text not null default 'INR' check (length(currency) between 3 and 8),
  metrics jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,id)
);

create table public.marketing_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  asset_type text not null check (asset_type in ('ad','post','email','outreach','landing_page','reel','creative_brief')),
  channel text not null check (length(channel) between 1 and 60),
  title text not null check (length(title) between 1 and 200),
  content text not null check (length(content) between 1 and 8000),
  creative_brief text,
  status text not null default 'draft' check (status in ('draft','approved','scheduled','published','rejected')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(company_id,campaign_id) references public.marketing_campaigns(company_id,id) on delete cascade
);

create table public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null,
  organization text not null check (length(organization) between 1 and 200),
  contact_name text,
  role text,
  source_url text not null check (source_url ~ '^https://'),
  reason text not null check (length(reason) between 1 and 1000),
  score integer not null check (score between 0 and 100),
  status text not null default 'discovered' check (status in ('discovered','qualified','contacted','replied','converted','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(company_id,campaign_id) references public.marketing_campaigns(company_id,id) on delete cascade
);

create index marketing_campaigns_company_created on public.marketing_campaigns(company_id,created_at desc);
create index marketing_assets_campaign_created on public.marketing_assets(campaign_id,created_at);
create index marketing_leads_campaign_score on public.marketing_leads(campaign_id,score desc);

alter table public.marketing_campaigns enable row level security;
alter table public.marketing_assets enable row level security;
alter table public.marketing_leads enable row level security;

revoke all on public.marketing_campaigns, public.marketing_assets, public.marketing_leads from public, anon, authenticated;
grant select, insert, update, delete on public.marketing_campaigns, public.marketing_assets, public.marketing_leads to authenticated;
grant all on public.marketing_campaigns, public.marketing_assets, public.marketing_leads to service_role;

create policy marketing_campaigns_owner on public.marketing_campaigns for all to authenticated
  using (user_id=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and c.user_id=(select auth.uid())))
  with check (user_id=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and c.user_id=(select auth.uid())));
create policy marketing_assets_owner on public.marketing_assets for all to authenticated
  using (user_id=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and c.user_id=(select auth.uid())))
  with check (user_id=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and c.user_id=(select auth.uid())));
create policy marketing_leads_owner on public.marketing_leads for all to authenticated
  using (user_id=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and c.user_id=(select auth.uid())))
  with check (user_id=(select auth.uid()) and exists(select 1 from public.companies c where c.id=company_id and c.user_id=(select auth.uid())));
