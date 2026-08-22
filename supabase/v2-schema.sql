-- Run this once in Supabase SQL Editor after the V1 schema.
-- Each table is private to its authenticated owner.
create table if not exists public.founder_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  kind text not null default 'insight' check (kind in ('insight','interview','experiment','decision')),
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  name text not null,
  website text,
  positioning text,
  pricing_notes text,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.customer_toolkits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  target_customer text not null,
  offer text not null,
  toolkit jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.founder_memories enable row level security;
alter table public.competitors enable row level security;
alter table public.customer_toolkits enable row level security;
revoke all on public.founder_memories, public.competitors, public.customer_toolkits from anon;
grant select, insert, update, delete on public.founder_memories, public.competitors, public.customer_toolkits to authenticated;
create policy "Owners manage founder memories" on public.founder_memories for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners manage competitors" on public.competitors for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners manage customer toolkits" on public.customer_toolkits for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists founder_memories_user_created_idx on public.founder_memories(user_id, created_at desc);
create index if not exists competitors_user_checked_idx on public.competitors(user_id, last_checked_at desc);
create index if not exists customer_toolkits_user_created_idx on public.customer_toolkits(user_id, created_at desc);
