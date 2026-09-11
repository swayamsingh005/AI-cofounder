-- Encrypted connector tokens. This table is intentionally inaccessible through the client Data API.
create table public.connector_credentials (
  connection_id uuid primary key references public.connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github','posthog','stripe','notion')),
  ciphertext text not null,
  iv text not null,
  tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.connector_credentials enable row level security;
revoke all on public.connector_credentials from public, anon, authenticated;
create index connector_credentials_user_id_idx on public.connector_credentials(user_id);
