-- Training: Hevy workouts, sets, exercise templates, sync state, body
-- measurements and Apple Health daily metrics. All written by the server's
-- sync jobs; the dashboard only reads.

-- Per-user templates: Hevy custom exercises are private to each account, so a
-- shared catalog table can't hold them safely.
create table public.exercise_templates (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  title text not null,
  type text,
  primary_muscle_group text,
  secondary_muscle_groups text[] not null default '{}',
  equipment text,
  is_custom boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index exercise_templates_title_trgm on public.exercise_templates
  using gin (title extensions.gin_trgm_ops);

create table public.workouts (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  title text,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  hevy_updated_at timestamptz,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index workouts_user_start_idx on public.workouts (user_id, start_time desc);

create table public.workout_sets (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  workout_id text not null,
  exercise_template_id text,
  exercise_title text not null,
  exercise_index int not null,
  set_index int not null,
  set_type text,
  weight_kg numeric,
  reps int,
  rpe numeric,
  duration_seconds int,
  distance_meters numeric,
  foreign key (user_id, workout_id) references public.workouts (user_id, id) on delete cascade
);

create index workout_sets_workout_idx on public.workout_sets (user_id, workout_id);
create index workout_sets_template_idx on public.workout_sets (user_id, exercise_template_id);

create table public.hevy_sync_state (
  user_id uuid primary key references auth.users on delete cascade,
  backfill_page int not null default 0,
  backfill_done boolean not null default false,
  body_backfill_done boolean not null default false,
  last_event_sync timestamptz,
  templates_synced_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create trigger hevy_sync_state_updated_at before update on public.hevy_sync_state
  for each row execute function public.set_updated_at();

create table public.body_measurements (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  -- 'manual' is a weigh-in typed into the dashboard, for users with no scale
  -- syncing yet; synced sources win over it.
  source text not null check (source in ('hevy', 'apple_health', 'manual')),
  weight_kg numeric,
  fat_percent numeric,
  synced_at timestamptz not null default now(),
  primary key (user_id, date, source)
);

create table public.health_daily (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  metric text not null check (metric in ('steps', 'active_kcal', 'basal_kcal')),
  value numeric not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, date, metric)
);

do $$
declare t text;
begin
  foreach t in array array[
    'exercise_templates', 'workouts', 'workout_sets', 'hevy_sync_state',
    'body_measurements', 'health_daily'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      t || '_select', t
    );
  end loop;
end;
$$;

create policy body_measurements_manual_write on public.body_measurements
  for all to authenticated
  using ((select auth.uid()) = user_id and source = 'manual')
  with check ((select auth.uid()) = user_id and source = 'manual');

-- Weigh-ins from the user's preferred source, falling back to the other synced
-- source, then a manual entry, on days the preferred source has nothing.
create view public.bodyweight
with (security_invoker = true)
as
select distinct on (m.user_id, m.date)
  m.user_id, m.date, m.weight_kg, m.fat_percent, m.source
from public.body_measurements m
join public.profiles p on p.user_id = m.user_id
where m.weight_kg is not null
order by m.user_id, m.date, (m.source = p.weight_source) desc, (m.source = 'manual') asc;
