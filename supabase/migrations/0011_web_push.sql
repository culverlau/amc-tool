-- Web Push subscriptions (PWA). One row per browser/device a user has enabled
-- notifications on. scripts/snipe_seats.py (service role) reads these and deletes
-- rows whose endpoint returns 404/410 (subscription expired or revoked).

create table web_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index web_push_subscriptions_user_id_idx on web_push_subscriptions (user_id);

alter table web_push_subscriptions enable row level security;

create policy "own web push subs" on web_push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
