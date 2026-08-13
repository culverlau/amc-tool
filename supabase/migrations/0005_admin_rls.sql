-- Single hardcoded owner, no roles table — this app has exactly one admin.
-- UI gating (web/src/config.js ADMIN_EMAIL) is not itself security; these
-- policies are what actually enforce it, per this project's "RLS is the real
-- boundary" convention (see shared/src/queries.js header comment).

-- Adds to, not replaces, the existing "read own profile" policy — RLS
-- policies are OR'd, so a regular user still only sees their own row.
create policy "admin reads all profiles" on profiles
  for select to authenticated using (auth.jwt() ->> 'email' = 'culverlau@gmail.com');

create policy "admin updates any profile" on profiles
  for update to authenticated
  using (auth.jwt() ->> 'email' = 'culverlau@gmail.com')
  with check (auth.jwt() ->> 'email' = 'culverlau@gmail.com');

-- The status/snipe_cap lockout stays for everyone except the admin.
create or replace function guard_profile_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.status <> old.status or new.snipe_cap <> old.snipe_cap)
     and auth.jwt() ->> 'email' <> 'culverlau@gmail.com' then
    raise exception 'status and snipe_cap are not user-editable';
  end if;
  return new;
end;
$$;

-- app_settings had no update policy at all before this (service-role/SQL only).
create policy "admin updates app_settings" on app_settings
  for update to authenticated
  using (auth.jwt() ->> 'email' = 'culverlau@gmail.com')
  with check (auth.jwt() ->> 'email' = 'culverlau@gmail.com');
