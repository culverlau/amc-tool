-- Append-only log of seat alerts, separate from notifications_sent (which is
-- a single-row-per-(user,showtime) dedupe cache that dispatch_for_row relies
-- on for change detection and must stay as-is). This is purely for the user
-- to look back at what fired. Rows older than 30 days are deleted by
-- expire_old_notification_history() in scripts/snipe_seats.py, same place
-- expire_past_showtimes() already runs every cycle.
create table notification_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles on delete cascade,
  showtime_id bigint not null,
  movie_name  text not null,
  seats       text[] not null,
  sent_at     timestamptz not null default now()
);

create index notification_history_user_idx on notification_history (user_id, sent_at desc);

alter table notification_history enable row level security;

create policy "own notification history" on notification_history
  for select to authenticated using (user_id = auth.uid());
