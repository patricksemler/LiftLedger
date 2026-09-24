-- Nutrition: meals (one row per eating event) made of meal_items (one row per
-- food). Meal totals are always the sum of their items — a trigger keeps them
-- in sync — so "what am I overeating on" can be answered from items while the
-- dashboard reads cheap per-meal totals.

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  eaten_at timestamptz not null default now(),
  -- The user's calendar day for eaten_at, fixed at write time from their
  -- profile timezone so daily totals never shift if they travel later.
  local_date date not null,
  title text not null,
  source text not null default 'dashboard'
    check (source in ('tg_text', 'tg_photo', 'dashboard', 'repeat')),
  confidence text check (confidence in ('high', 'medium', 'low')),
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric not null default 0,
  raw_text text,
  parse jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meals_user_date_idx on public.meals (user_id, local_date desc);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  position int not null default 0,
  name text not null,
  brand text,
  quantity numeric,
  unit text,
  grams numeric,
  calories numeric not null default 0 check (calories >= 0),
  protein_g numeric not null default 0 check (protein_g >= 0),
  carbs_g numeric not null default 0 check (carbs_g >= 0),
  fat_g numeric not null default 0 check (fat_g >= 0),
  fiber_g numeric not null default 0 check (fiber_g >= 0),
  match_source text not null default 'user'
    check (match_source in ('user', 'saved_food', 'recall', 'usda', 'off', 'llm')),
  match_ref text,
  created_at timestamptz not null default now()
);

create index meal_items_meal_idx on public.meal_items (meal_id);
create index meal_items_user_name_trgm on public.meal_items
  using gin (name extensions.gin_trgm_ops);

create table public.saved_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  brand text,
  -- What "1 serving" means, e.g. "2/3 cup (55 g)".
  serving_desc text not null default '1 serving',
  serving_grams numeric,
  calories numeric not null check (calories >= 0),
  protein_g numeric not null default 0 check (protein_g >= 0),
  carbs_g numeric not null default 0 check (carbs_g >= 0),
  fat_g numeric not null default 0 check (fat_g >= 0),
  fiber_g numeric not null default 0 check (fiber_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index saved_foods_user_name_idx on public.saved_foods (user_id, lower(name));
create index saved_foods_name_trgm on public.saved_foods
  using gin (name extensions.gin_trgm_ops);

-- Goals keep history: the goal that applies on day D is the latest row with
-- effective_from <= D, so past adherence is judged against the goal of the day.
create table public.nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  effective_from date not null,
  preset text not null check (preset in ('lose_fat', 'maintain', 'build_muscle', 'custom')),
  calories int not null check (calories > 0),
  protein_g int not null check (protein_g >= 0),
  carbs_g int not null check (carbs_g >= 0),
  fat_g int not null check (fat_g >= 0),
  protein_g_per_lb numeric,
  rationale text,
  created_at timestamptz not null default now(),
  unique (user_id, effective_from)
);

create trigger meals_updated_at before update on public.meals
  for each row execute function public.set_updated_at();
create trigger saved_foods_updated_at before update on public.saved_foods
  for each row execute function public.set_updated_at();

-- local_date from the owner's timezone --------------------------------------

create or replace function public.meals_set_local_date()
returns trigger
language plpgsql
set search_path = ''
as $$
declare tz text;
begin
  if tg_op = 'INSERT' or new.eaten_at is distinct from old.eaten_at then
    select p.timezone into tz from public.profiles p where p.user_id = new.user_id;
    new.local_date = (new.eaten_at at time zone coalesce(tz, 'UTC'))::date;
  end if;
  return new;
end;
$$;

create trigger meals_local_date before insert or update of eaten_at on public.meals
  for each row execute function public.meals_set_local_date();

-- meal totals = sum(items) ---------------------------------------------------

create or replace function public.meals_recompute_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare mid uuid;
begin
  mid = coalesce(new.meal_id, old.meal_id);
  update public.meals m set
    calories = s.calories, protein_g = s.protein_g, carbs_g = s.carbs_g,
    fat_g = s.fat_g, fiber_g = s.fiber_g
  from (
    select coalesce(sum(i.calories), 0) calories, coalesce(sum(i.protein_g), 0) protein_g,
           coalesce(sum(i.carbs_g), 0) carbs_g, coalesce(sum(i.fat_g), 0) fat_g,
           coalesce(sum(i.fiber_g), 0) fiber_g
    from public.meal_items i where i.meal_id = mid
  ) s
  where m.id = mid;
  return null;
end;
$$;

create trigger meal_items_totals after insert or update or delete on public.meal_items
  for each row execute function public.meals_recompute_totals();

-- A meal item must belong to a meal of the same user.
create or replace function public.meal_items_check_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.meals m where m.id = new.meal_id and m.user_id = new.user_id) then
    raise exception 'meal_items.user_id must match its meal';
  end if;
  return new;
end;
$$;

create trigger meal_items_owner before insert or update on public.meal_items
  for each row execute function public.meal_items_check_owner();

-- log_meal: atomic meal + items insert, used by the dashboard (as the user)
-- and the server (service role, passing p_user_id explicitly). ---------------

create or replace function public.log_meal(
  p_title text,
  p_items jsonb,
  p_eaten_at timestamptz default now(),
  p_source text default 'dashboard',
  p_confidence text default null,
  p_raw_text text default null,
  p_parse jsonb default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid = coalesce(p_user_id, auth.uid());
  mid uuid;
begin
  if uid is null then
    raise exception 'log_meal: no user';
  end if;
  if auth.uid() is not null and uid <> auth.uid() then
    raise exception 'log_meal: cannot log for another user';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'log_meal: at least one item is required';
  end if;

  insert into public.meals (user_id, eaten_at, title, source, confidence, raw_text, parse)
  values (uid, coalesce(p_eaten_at, now()), p_title, p_source, p_confidence, p_raw_text, p_parse)
  returning id into mid;

  insert into public.meal_items (
    meal_id, user_id, position, name, brand, quantity, unit, grams,
    calories, protein_g, carbs_g, fat_g, fiber_g, match_source, match_ref
  )
  select mid, uid, (e.ord - 1)::int,
         e.item ->> 'name', e.item ->> 'brand', (e.item ->> 'quantity')::numeric,
         e.item ->> 'unit', (e.item ->> 'grams')::numeric,
         coalesce((e.item ->> 'calories')::numeric, 0),
         coalesce((e.item ->> 'protein_g')::numeric, 0),
         coalesce((e.item ->> 'carbs_g')::numeric, 0),
         coalesce((e.item ->> 'fat_g')::numeric, 0),
         coalesce((e.item ->> 'fiber_g')::numeric, 0),
         coalesce(e.item ->> 'match_source', 'user'), e.item ->> 'match_ref'
  from jsonb_array_elements(p_items) with ordinality as e (item, ord);

  return mid;
end;
$$;

grant execute on function public.log_meal to authenticated, service_role;

-- RLS ----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['meals', 'meal_items', 'saved_foods', 'nutrition_goals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t || '_owner_all', t
    );
  end loop;
end;
$$;

-- Daily totals joined to the goal in effect that day.
create view public.daily_nutrition
with (security_invoker = true)
as
select
  m.user_id,
  m.local_date as date,
  count(*)::int as meal_count,
  sum(m.calories) as calories,
  sum(m.protein_g) as protein_g,
  sum(m.carbs_g) as carbs_g,
  sum(m.fat_g) as fat_g,
  sum(m.fiber_g) as fiber_g,
  g.calories as goal_calories,
  g.protein_g as goal_protein_g
from public.meals m
left join lateral (
  select ng.calories, ng.protein_g
  from public.nutrition_goals ng
  where ng.user_id = m.user_id and ng.effective_from <= m.local_date
  order by ng.effective_from desc
  limit 1
) g on true
group by m.user_id, m.local_date, g.calories, g.protein_g;
