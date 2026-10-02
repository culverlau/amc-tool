-- Movies a user wants to see, pinned to the top of their main list and shown
-- in the Wishlist view. Keyed by AMC movie id like hidden_movies (distinct from
-- `watchlist`, which is per-showtime seat sniping). name/poster are a snapshot
-- so the Wishlist view can still show a movie once it's no longer playing at
-- any followed theater.
create table wishlist_movies (
  user_id    uuid   not null references profiles on delete cascade,
  movie_id   bigint not null,
  movie_name text   not null,
  poster     text,
  added_at   timestamptz not null default now(),
  primary key (user_id, movie_id)
);

alter table wishlist_movies enable row level security;
create policy "own wishlist movies" on wishlist_movies
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
