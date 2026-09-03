-- Daily founder brief cache. One row per company per calendar day — generated once, reused on
-- every visit that day, per the cost-control principle in the V2 spec (never regenerate unchanged
-- information). "attention_items" are computed deterministically from real task data in code, not
-- AI-generated, so they can never be a fabricated fact — only "recommended_priority" is AI-written,
-- and only from those same deterministic facts.
create table if not exists public.daily_briefs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_date date not null,
  recommended_priority text,
  attention_items jsonb not null default '[]'::jsonb,
  generated_by text not null default 'ai' check (generated_by in ('ai', 'template')),
  created_at timestamptz not null default now(),
  unique (company_id, brief_date)
);
alter table public.daily_briefs enable row level security;
create policy "daily_briefs_all_own" on public.daily_briefs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

create index if not exists idx_daily_briefs_company_date on public.daily_briefs(company_id, brief_date desc);
