-- Interim seat-sniper notification channel until the Expo app ships and
-- push_tokens has real registrations. Each user gets their own randomly
-- generated ntfy.sh topic (unguessable, since ntfy topics are public to
-- anyone who knows the name) — subscribe from the free ntfy app and that's
-- the whole "integration". snipe_seats.py sends to this instead of the
-- single shared SNIPER_DEBUG_NTFY_TOPIC.
alter table profiles
  add column ntfy_topic text unique default ('amc-' || encode(extensions.gen_random_bytes(12), 'hex'));

-- Backfill existing users so nobody is left without a topic.
update profiles set ntfy_topic = 'amc-' || encode(extensions.gen_random_bytes(12), 'hex') where ntfy_topic is null;

alter table profiles alter column ntfy_topic set not null;

-- New signups get one automatically via the column default, but
-- handle_new_user's explicit column list bypasses defaults for columns it
-- doesn't name, so no change needed there — it already omits ntfy_topic.
