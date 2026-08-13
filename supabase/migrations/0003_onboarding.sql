-- Tracks whether a user has been through the first-run onboarding flow
-- (follow a theater, set up ntfy alerts). Null means "not yet" — there's no
-- default because a fresh signup should always see it once.
alter table profiles add column onboarded_at timestamptz;
