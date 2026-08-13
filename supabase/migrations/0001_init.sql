-- AMC tool: multi-user schema.
--
-- RLS note: the `service_role` key bypasses RLS entirely, so tables that only the
-- GitHub Actions jobs touch (notifications_sent) get RLS enabled with *no* policies.
-- That blocks anon and authenticated completely while leaving the jobs unaffected.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- app settings

-- Singleton row so the soft user cap can be changed without a migration.
create table app_settings (
  id            boolean primary key default true constraint app_settings_singleton check (id),
  max_active_users int not null default 50,
  default_snipe_cap int not null default 15
);
insert into app_settings default values;

alter table app_settings enable row level security;
create policy "app_settings readable" on app_settings
  for select to authenticated using (true);

-- -------------------------------------------------------------------- profiles

create type user_status as enum ('active', 'waitlisted');

create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text,
  display_name text,
  status       user_status not null default 'active',
  snipe_cap    int not null default 15,
  -- Default seat zone applied to newly starred showtimes. Was hardcoded E-L / 7-36.
  row_min      text not null default 'E',
  row_max      text not null default 'L',
  seat_min     int  not null default 7,
  seat_max     int  not null default 36,
  created_at   timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "read own profile" on profiles
  for select to authenticated using (id = auth.uid());

-- Users may edit their own preferences but NOT their status or snipe_cap;
-- the guard trigger below enforces that, since column-level RLS can't.
create policy "update own profile" on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create function guard_profile_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> old.status or new.snipe_cap <> old.snipe_cap then
    raise exception 'status and snipe_cap are not user-editable';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_privileged
  before update on profiles
  for each row execute function guard_profile_privileged_columns();

-- New signups land active until the soft cap is reached, then waitlisted.
create function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cfg    app_settings%rowtype;
  actives int;
begin
  select * into cfg from app_settings limit 1;
  select count(*) into actives from profiles where status = 'active';

  insert into profiles (id, email, display_name, status, snipe_cap)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    case when actives < cfg.max_active_users then 'active' else 'waitlisted' end::user_status,
    cfg.default_snipe_cap
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -------------------------------------------------------------------- theaters

-- Populated from AMC /v2/theatres (~524 rows) by scripts/sync_theaters.py.
create table theaters (
  amc_id          int primary key,
  name            text not null,
  slug            text,
  city            text,
  state           text,
  latitude        double precision,
  longitude       double precision,
  timezone        text,
  -- Raw "+HH:MM"/"-HH:MM" offset from AMC, e.g. "-04:00". Needed to render a
  -- showtime's notification time correctly in *that theater's* local time —
  -- `timezone` alone ("EASTERN TIME") isn't enough to do that math nationwide.
  utc_offset      text,
  last_fetched_at timestamptz,
  synced_at       timestamptz not null default now()
);

create index theaters_search_idx on theaters using gin (
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(city,'') || ' ' || coalesce(state,''))
);

alter table theaters enable row level security;
create policy "theaters readable" on theaters
  for select to authenticated using (true);

-- --------------------------------------------------------------- user_theaters

create table user_theaters (
  user_id    uuid not null references profiles on delete cascade,
  amc_id     int  not null references theaters on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, amc_id)
);

-- fetch_showtimes.py queries "which theaters does anyone follow" off this.
create index user_theaters_amc_id_idx on user_theaters (amc_id);

alter table user_theaters enable row level security;
create policy "own theater follows" on user_theaters
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------------- watchlist

-- Keyed (user_id, showtime_id): two users can star the same showtime with
-- different seat zones. starts_at is a real timestamptz built from the AMC
-- `startsAt` local-ISO string, so expiry math is correct across timezones
-- without any per-theater timezone handling.
create table watchlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles on delete cascade,
  showtime_id bigint not null,
  theater_id  int not null references theaters on delete cascade,
  movie_name  text not null,
  starts_at   timestamptz not null,
  format      text,
  row_min     text not null,
  row_max     text not null,
  seat_min    int  not null,
  seat_max    int  not null,
  created_at  timestamptz not null default now(),
  unique (user_id, showtime_id)
);

create index watchlist_user_idx on watchlist (user_id);
create index watchlist_starts_at_idx on watchlist (starts_at);

alter table watchlist enable row level security;
create policy "own watchlist" on watchlist
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Cap active snipes per user. Enforced here as well as in the UI so it can't be
-- bypassed by calling the REST API directly.
create function enforce_snipe_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cap     int;
  current int;
begin
  select snipe_cap into cap from profiles where id = new.user_id;
  select count(*) into current
    from watchlist
   where user_id = new.user_id
     and starts_at > now();

  if current >= cap then
    raise exception 'snipe limit reached (%). Remove a showtime first.', cap
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger watchlist_enforce_cap
  before insert on watchlist
  for each row execute function enforce_snipe_cap();

-- -------------------------------------------------------------- showtime_seats

-- One row per showtime, shared by every user watching it: the sniper scrapes
-- each showtime once per cycle and each user's zone is evaluated against this.
create table showtime_seats (
  showtime_id     bigint primary key,
  available_seats text[] not null default '{}',
  sold_out        boolean not null default false,
  scraped_at      timestamptz not null default now()
);

alter table showtime_seats enable row level security;
create policy "seats readable" on showtime_seats
  for select to authenticated using (true);

-- ---------------------------------------------------------- notifications_sent

-- Replaces the global sniper_state.json. Per-user, so one user's alert no
-- longer consumes the "new seat" event for everyone.
-- No policies: service_role only.
create table notifications_sent (
  user_id       uuid not null references profiles on delete cascade,
  showtime_id   bigint not null,
  seat_set_hash text not null,
  -- The actual seat list last notified on, so the next cycle's push can say
  -- "NEW: F22 G15" / "LOST: F22" instead of just "something changed".
  seats         text[] not null default '{}',
  sent_at       timestamptz not null default now(),
  primary key (user_id, showtime_id)
);

alter table notifications_sent enable row level security;

-- ----------------------------------------------------------------- push_tokens

create table push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles on delete cascade,
  expo_token   text not null unique,
  platform     text,
  device_label text,
  created_at   timestamptz not null default now()
);

create index push_tokens_user_idx on push_tokens (user_id);

alter table push_tokens enable row level security;
create policy "own push tokens" on push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- movie_scores

-- Replaces the Scores tab of the Google Sheet.
create table movie_scores (
  amc_id     bigint primary key,
  title      text,
  rt_score   int,
  rt_slug    text,
  fetched_at timestamptz not null default now()
);

alter table movie_scores enable row level security;
create policy "scores readable" on movie_scores
  for select to authenticated using (true);
