-- Sign-up no longer asks for a name. It's an optional profile setting (what
-- the app calls you), so new profiles start with no display_name instead of
-- the email's local part.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''));
  return new;
end;
$$;
