-- Core: profiles, integrations, secrets, Telegram linking, Health ingest tokens.
--
-- RLS convention: every user-owned table has RLS on and policies written as
-- `(select auth.uid()) = user_id` so auth.uid() is evaluated once per query,
-- not once per row. Tables the dashboard must never write (sync-owned data,
-- secrets) get a SELECT policy only — or none at all — and are written by the
-- server with the service role, which scopes every query by user_id itself.

create extension if not exists pg_trgm with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles -------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text,
  height_cm numeric(5, 1) check (height_cm > 0),
  birth_date date,
  sex text check (sex in ('male', 'female')),
  activity_level text check (
    activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')
  ),
  timezone text not null default 'America/Chicago',
  units text not null default 'lb' check (units in ('lb', 'kg')),
  weight_source text not null default 'hevy' check (weight_source in ('hevy', 'apple_health')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_update on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Every new auth user gets a profile row, so the app never has to handle
-- "signed in but no profile".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- integrations -----------------------------------------------------------------
-- One row per (user, provider). Holds non-secret status/config only; the
-- dashboard reads it to render Connections, the server writes it.

create table public.integrations (
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('hevy', 'ai', 'telegram', 'apple_health')),
  status text not null default 'connected' check (status in ('connected', 'error', 'disconnected')),
  config jsonb not null default '{}'::jsonb,
  secret_last4 text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create trigger integrations_updated_at before update on public.integrations
  for each row execute function public.set_updated_at();

alter table public.integrations enable row level security;

create policy integrations_select on public.integrations
  for select to authenticated using ((select auth.uid()) = user_id);

-- user_secrets -------------------------------------------------------------------
-- AES-256-GCM ciphertext written by the server. RLS on with NO policies: the
-- anon/authenticated roles can't read or write it at all.

create table public.user_secrets (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('hevy_api_key', 'ai_api_key')),
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_version smallint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.user_secrets enable row level security;
revoke all on public.user_secrets from anon, authenticated;

-- Health Auto Export ingest tokens (sha-256 of the bearer token) -----------------

create table public.health_ingest_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.health_ingest_tokens enable row level security;
revoke all on public.health_ingest_tokens from anon, authenticated;

-- Telegram ---------------------------------------------------------------------

create table public.telegram_links (
  user_id uuid primary key references auth.users on delete cascade,
  chat_id bigint not null unique,
  tg_user_id bigint not null,
  tg_username text,
  linked_at timestamptz not null default now()
);

alter table public.telegram_links enable row level security;

create policy telegram_links_select on public.telegram_links
  for select to authenticated using ((select auth.uid()) = user_id);
create policy telegram_links_delete on public.telegram_links
  for delete to authenticated using ((select auth.uid()) = user_id);

create table public.telegram_link_codes (
  code_hash text primary key,
  user_id uuid not null references auth.users on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

create index telegram_link_codes_user_idx on public.telegram_link_codes (user_id);

alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_link_codes from anon, authenticated;
