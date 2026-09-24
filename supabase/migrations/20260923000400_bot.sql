-- Bot: short rolling chat history and an AI call log for debugging/usage.

create table public.bot_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  meal_id uuid references public.meals on delete set null,
  created_at timestamptz not null default now()
);

create index bot_messages_user_idx on public.bot_messages (user_id, created_at desc);

create table public.ai_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  purpose text not null,
  model text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  tool_calls jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index ai_calls_user_idx on public.ai_calls (user_id, created_at desc);

alter table public.bot_messages enable row level security;
alter table public.ai_calls enable row level security;
create policy bot_messages_select on public.bot_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_calls_select on public.ai_calls
  for select to authenticated using ((select auth.uid()) = user_id);

-- Realtime: the dashboard invalidates its queries when these change, so a meal
-- logged from Telegram or a finished Hevy sync shows up without a refresh.
alter publication supabase_realtime add table
  public.meals, public.meal_items, public.nutrition_goals, public.integrations,
  public.hevy_sync_state, public.workouts, public.body_measurements,
  public.health_daily, public.telegram_links;
