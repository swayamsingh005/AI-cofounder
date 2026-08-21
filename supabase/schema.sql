-- Run in a new Supabase project. All user data is protected by ownership policies.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea text not null,
  title text not null,
  verdict text not null check (verdict in ('BUILD', 'TEST FIRST', 'AVOID')),
  score integer not null check (score between 0 and 100),
  report jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;
create policy "Users read their own reports" on public.reports for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create their own reports" on public.reports for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update their own reports" on public.reports for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own reports" on public.reports for delete to authenticated using ((select auth.uid()) = user_id);
