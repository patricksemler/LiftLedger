-- Fuzzy lookups the bot's food resolver runs before hitting any external
-- database: the user's saved foods, then items they've logged before. Called
-- by the server (service role) with an explicit user id.

create or replace function public.match_saved_foods(p_user_id uuid, p_query text, p_limit int default 3)
returns table (
  id uuid, name text, brand text, serving_desc text, serving_grams numeric,
  calories numeric, protein_g numeric, carbs_g numeric, fat_g numeric, fiber_g numeric,
  score real
)
language sql
stable
set search_path = ''
as $$
  select f.id, f.name, f.brand, f.serving_desc, f.serving_grams,
         f.calories, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g,
         greatest(
           extensions.similarity(lower(f.name), lower(p_query)),
           extensions.similarity(lower(coalesce(f.brand || ' ', '') || f.name), lower(p_query))
         ) as score
  from public.saved_foods f
  where f.user_id = p_user_id
  order by score desc
  limit p_limit;
$$;

create or replace function public.match_recent_items(p_user_id uuid, p_query text, p_limit int default 3)
returns table (
  name text, brand text, quantity numeric, unit text, grams numeric,
  calories numeric, protein_g numeric, carbs_g numeric, fat_g numeric, fiber_g numeric,
  match_source text, times int, score real
)
language sql
stable
set search_path = ''
as $$
  select * from (
    -- Latest logged version of each distinct food name.
    select distinct on (lower(i.name))
           i.name, i.brand, i.quantity, i.unit, i.grams,
           i.calories, i.protein_g, i.carbs_g, i.fat_g, i.fiber_g, i.match_source,
           (count(*) over (partition by lower(i.name)))::int as times,
           extensions.similarity(lower(i.name), lower(p_query)) as score
    from public.meal_items i
    where i.user_id = p_user_id
      and i.created_at > now() - interval '120 days'
      and extensions.similarity(lower(i.name), lower(p_query)) > 0.35
    order by lower(i.name), i.created_at desc
  ) latest
  order by score desc, times desc
  limit p_limit;
$$;

revoke all on function public.match_saved_foods, public.match_recent_items from public, anon, authenticated;
grant execute on function public.match_saved_foods, public.match_recent_items to service_role;
