-- Lets a user hide a movie they've already seen from their main list. Keyed
-- by AMC movie id (stable across theaters/showtimes/dates), not a specific
-- showtime — hiding a movie hides it everywhere until unhidden.
create table hidden_movies (
  user_id    uuid   not null references profiles on delete cascade,
  movie_id   bigint not null,
  hidden_at  timestamptz not null default now(),
  primary key (user_id, movie_id)
);

alter table hidden_movies enable row level security;
create policy "own hidden movies" on hidden_movies
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
