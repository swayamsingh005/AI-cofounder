alter table public.connections drop constraint if exists connections_provider_check;
alter table public.connections add constraint connections_provider_check
  check (provider in ('github','vercel','supabase','posthog','stripe','notion'));

alter table public.connector_credentials drop constraint if exists connector_credentials_provider_check;
alter table public.connector_credentials add constraint connector_credentials_provider_check
  check (provider in ('github','vercel','supabase','posthog','stripe','notion'));
