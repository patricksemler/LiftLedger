-- Smoke test for RLS isolation and the meal triggers. Runs in a transaction
-- and rolls back. Usage: pnpm db:test
begin;

insert into auth.users (id, email, instance_id, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

update public.profiles set timezone = 'America/Chicago';

-- act as user A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select public.log_meal(
  'Late snack',
  '[{"name":"granola","calories":240,"protein_g":5,"carbs_g":38,"fat_g":8},
    {"name":"milk","calories":120,"protein_g":8,"carbs_g":12,"fat_g":5}]'::jsonb,
  '2026-09-23 04:30:00+00' -- 23:30 on the 22nd in Chicago
);

do $$
declare r record;
begin
  select * into r from public.meals;
  assert r.calories = 360, format('meal total should be 360, got %s', r.calories);
  assert r.local_date = '2026-09-22', format('local_date should be 2026-09-22, got %s', r.local_date);
  assert (select count(*) from public.profiles) = 1, 'A must only see their own profile';
  begin
    perform 1 from public.user_secrets;
    assert false, 'user_secrets must be unreadable';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- act as user B
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
begin
  assert (select count(*) from public.meals) = 0, 'B must not see A''s meals';
  assert (select count(*) from public.meal_items) = 0, 'B must not see A''s items';
  update public.meals set title = 'hacked';
  delete from public.meal_items;
  begin
    perform public.log_meal('x', '[{"name":"x"}]'::jsonb, now(), 'dashboard', null, null, null,
      '00000000-0000-0000-0000-00000000000a');
    assert false, 'B must not log a meal for A';
  exception when raise_exception then null;
  end;
end;
$$;

reset role;
do $$
begin
  assert (select title from public.meals) = 'Late snack', 'B''s update must not touch A''s meal';
  assert (select count(*) from public.meal_items) = 2, 'B''s delete must not touch A''s items';
end;
$$;

select 'rls_and_meals: ok' as result;
rollback;
