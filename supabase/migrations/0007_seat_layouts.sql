-- Cached physical seat-layout range per (theater, layoutId), scraped once and
-- reused across every showtime that shares that auditorium's layoutId.
-- layoutId is stable per physical room (confirmed against AMC's live API:
-- theater 2116's auditorium 1 is always layoutId 130 across movies/dates) but
-- is scoped to (theater_id, layout_id) here rather than layout_id alone,
-- since there's no confirmation layoutId is unique nationwide across theaters.
create table seat_layouts (
  theater_id  bigint      not null,
  layout_id   bigint      not null,
  row_min     text        not null,
  row_max     text        not null,
  seat_min    int         not null,
  seat_max    int         not null,
  scraped_at  timestamptz not null default now(),
  primary key (theater_id, layout_id)
);

alter table seat_layouts enable row level security;
create policy "seat layouts readable" on seat_layouts
  for select to authenticated using (true);
