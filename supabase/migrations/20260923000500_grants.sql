-- Explicit table privileges. This Supabase version doesn't grant public-schema
-- tables to the API roles by default, so every grant is spelled out here: RLS
-- decides *which rows*, these grants decide *which operations* at all.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Dashboard-writable (owner rows only, via RLS).
grant select, insert, update, delete on
  public.meals, public.meal_items, public.saved_foods, public.nutrition_goals
to authenticated;

grant select, update on public.profiles to authenticated;
grant insert, update, delete on public.body_measurements to authenticated; -- manual rows only (RLS)
grant select, delete on public.telegram_links to authenticated;

-- Sync-owned / server-owned: read-only for the dashboard.
grant select on
  public.integrations, public.exercise_templates, public.workouts, public.workout_sets,
  public.hevy_sync_state, public.body_measurements, public.health_daily,
  public.bot_messages, public.ai_calls,
  public.bodyweight, public.daily_nutrition
to authenticated;

-- user_secrets, health_ingest_tokens and telegram_link_codes get nothing.
