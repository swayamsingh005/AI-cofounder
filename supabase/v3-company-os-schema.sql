-- AI Co-Founder V2 — Company Workspace schema.
-- Run this in Supabase SQL Editor after confirming v1 (schema.sql) is already applied.
-- The old /v2 "evidence workspace" (founder_memories, competitors, customer_toolkits from
-- v2-schema.sql) is being discarded as a standalone product surface per product decision —
-- this file does NOT touch or drop those tables. founder_memories keeps working as-is to
-- avoid breaking the existing evidence-recompute feature on /report/[id] until that flow is
-- migrated onto Company Memory in a later pass.

-- ── companies ────────────────────────────────────────────────────────────────
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null, -- the V1 report this was built from, if any
  name text not null,
  stage text not null default 'validation' check (stage in ('validation','mvp','launch','growth')),
  industry text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.companies enable row level security;
create policy "companies_select_own" on public.companies for select to authenticated using ((select auth.uid()) = user_id);
create policy "companies_insert_own" on public.companies for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "companies_update_own" on public.companies for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "companies_delete_own" on public.companies for delete to authenticated using ((select auth.uid()) = user_id);

-- ── company_profiles (1:1 with companies) ──────────────────────────────────
create table if not exists public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  description text,
  problem text,
  solution text,
  business_model text,
  target_customer text,
  target_geography text,
  constraints text,
  strategy text,
  assumptions jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.company_profiles enable row level security;
create policy "company_profiles_all_own" on public.company_profiles for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ── goals ────────────────────────────────────────────────────────────────────
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  target text,
  deadline date,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  progress integer not null default 0 check (progress between 0 and 100),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.goals enable row level security;
create policy "goals_all_own" on public.goals for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ── missions ─────────────────────────────────────────────────────────────────
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  objective text not null,
  why_it_matters text,
  success_criteria text,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  progress integer not null default 0 check (progress between 0 and 100),
  ai_recommendation text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.missions enable row level security;
create policy "missions_all_own" on public.missions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ── milestones ───────────────────────────────────────────────────────────────
create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo','in_progress','completed')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.milestones enable row level security;
create policy "milestones_all_own" on public.milestones for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ── tasks ────────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  mission_id uuid references public.missions(id) on delete set null,
  milestone_id uuid references public.milestones(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','completed')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  source text not null default 'ai' check (source in ('ai','user')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tasks enable row level security;
create policy "tasks_all_own" on public.tasks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ── decisions ────────────────────────────────────────────────────────────────
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  reasoning text,
  alternatives_considered jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','reconsidered','reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.decisions enable row level security;
create policy "decisions_all_own" on public.decisions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ── memories (company memory) ────────────────────────────────────────────────
-- kind is intentionally a plain text + check constraint, not an enum type, so new kinds can be
-- added later with a migration instead of an enum alter. No embeddings yet — content is plain
-- text, retrieved by recency/kind for now. A future `embedding vector(N)` column can be added
-- without breaking this table if/when semantic search is worth the infrastructure.
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fact','assumption','decision','learning','customer_insight','risk','strategy','experiment','event')),
  title text not null,
  content text not null,
  source text not null default 'ai' check (source in ('ai','user')),
  created_at timestamptz not null default now()
);
alter table public.memories enable row level security;
create policy "memories_all_own" on public.memories for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ── conversations + messages (raw chat history, separate from curated memory) ─
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversations enable row level security;
create policy "conversations_all_own" on public.conversations for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create policy "messages_all_own" on public.messages for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.conversations conv where conv.id = conversation_id and conv.user_id = auth.uid()));

-- ── activity_events (company timeline) ──────────────────────────────────────
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  detail text,
  created_at timestamptz not null default now()
);
alter table public.activity_events enable row level security;
create policy "activity_events_all_own" on public.activity_events for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.companies c where c.id = company_id and c.user_id = auth.uid()));

-- ── indexes ──────────────────────────────────────────────────────────────────
create index if not exists idx_companies_user on public.companies(user_id);
create index if not exists idx_goals_company on public.goals(company_id);
create index if not exists idx_missions_company on public.missions(company_id);
create index if not exists idx_milestones_mission on public.milestones(mission_id);
create index if not exists idx_tasks_company on public.tasks(company_id);
create index if not exists idx_tasks_mission on public.tasks(mission_id);
create index if not exists idx_decisions_company on public.decisions(company_id);
create index if not exists idx_memories_company on public.memories(company_id, created_at desc);
create index if not exists idx_conversations_company on public.conversations(company_id);
create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);
create index if not exists idx_activity_company on public.activity_events(company_id, created_at desc);
