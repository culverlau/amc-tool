# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # web dev server at localhost:5173 (workspace: web/)
npm run build           # production build → web/dist/
npm run app             # Expo dev server (workspace: app/) — not yet built, see below
npm run fetch-data       # fetch AMC showtimes for followed theaters → Supabase Storage
npm run sync-theaters    # refresh the theaters table from AMC's ~550-theater directory
npm run refresh-rt       # refresh Rotten Tomatoes scores
npm run snipe            # run the seat sniper manually
```

Python dependencies: `pip install -r scripts/requirements.txt` + `python3 -m playwright install chromium`.

## Local environment

This is Culver's **personal** project — its Google Cloud project (`amc-tool-505400`, for the
Google OAuth client) lives under his personal `culverlau@gmail.com` account, entirely separate
from his work GCP account/projects. Before running any `gcloud` command for this project,
switch to the `personal` CLI configuration (`gcloud config configurations activate personal`)
— never run it under the `default` (work) configuration. Check with `gcloud config
configurations list` if unsure which is active.

## Architecture

This was originally a single-tenant personal tool (one Google Sheet, 4 hardcoded NYC theaters,
GitHub Pages). It's now multi-user: individual accounts (soft-launch waitlisted via
`app_settings.max_active_users`), each with their own followed theaters (any AMC nationwide),
watchlist, and seat-zone preferences. Mobile push (Expo) is the intended long-term-only
notification channel; per-user ntfy.sh is the interim one until the Expo app ships. See
`/Users/culver/.claude/plans/so-i-think-i-hashed-thunder.md` for the original migration plan
(mostly done at this point — check "Not yet built" below for what's left).

**Repo layout (npm workspaces):**
- `web/` — the React + Vite + Tailwind SPA (formerly at the repo root)
- `shared/` — `@amc/shared`, used by both `web/` and the future `app/` (Expo): Supabase client
  factory, all DB queries (`shared/src/queries.js`), seat-zone math (`shared/src/seats.js`),
  multi-theater data merge (`shared/src/data.js`)
- `app/` — Expo/React Native app (iOS + Android), **not yet built**
- `scripts/` — Python jobs (unchanged location)
- `supabase/migrations/` — schema DDL, source of truth for the database

**Backend: Supabase.** Hosted Postgres + Auth (Google, Apple to follow) + Row Level Security.
There is no application server — both clients query Postgres directly via `@supabase/supabase-js`;
RLS is what actually enforces per-user data isolation, not application code. The anon key shipped
in both client bundles is meant to be public. The **service role key** (used only by the Python
jobs in GitHub Actions) bypasses RLS entirely and must never appear in `web/`, `app/`, or any
commit — see `scripts/supabase_client.py`.

**Hosting: Vercel**, auto-deploying `web/` on every push to `main` (`vercel.json` at the repo
root points it at the `web` workspace). GitHub Pages is retired — no more `VITE_BASE_PATH`
subpath juggling, no more curling live data back into the repo before a deploy.

### Data flow

```
AMC API ──► fetch_showtimes.py ──► theater-{id}.json (per followed theater) ──► Supabase Storage
                                                                                       │
                                                                    web (Vercel) / Expo app fetch
                                                                    only the theaters they follow

Supabase Postgres (profiles, theaters, user_theaters, watchlist, showtime_seats, ...)
    ◄── both clients query directly, RLS-scoped
    ◄── snipe_seats.py (service role) reads watchlist, writes showtime_seats + notifications
```

Theaters are fetched **on demand**: `fetch_showtimes.py` only pulls theaters with ≥1 follower
(there are ~550 AMC theaters total; fetching all of them would be ~50k API calls per run). Each
theater gets its own Storage object so a client only downloads theaters its user actually follows.
`shared/src/data.js` (`loadShowtimeData`) fetches and merges those per-theater files back into
the single shape the UI consumes.

### Key data details

- Theater directory (`theaters` table) comes from AMC's `/v2/theatres` endpoint (~550 theaters,
  paginated, `pageSize=100`), synced weekly by `scripts/sync_theaters.py`. Includes `utc_offset`
  ("-04:00" style) — needed to render notification times correctly per theater, nationwide.
- **`startsAt` / `watchlist.starts_at` is `showDateTimeUtc`, a true UTC instant** — not
  `showDateTimeLocal`, which carries no UTC offset and would silently misinterpret in Postgres'
  session timezone for any theater. This is what makes all showtime-expiry and sorting logic
  correct nationwide with zero per-theater timezone code. `date`/`time` fields stay local
  wall-clock, for display only.
- Language detection: AMC's `languages` field is always `{}` — language is parsed from
  `attributes[].name` via regex `r'^(\w+)\s+(?:Spoken|Language)\b'`.
- A-List eligibility: `availableForAList` boolean from `/v2/movies/{id}` (movie level, not
  showtime level).
- Fathom events: detected via the `EVENT` attribute code on the showtime.

### Watchlist / seat sniper

- Any showtime at a followed theater can be starred (not gated to a specific theater/format
  anymore). Adding to the watchlist is `addToWatchlist` in `shared/src/queries.js`, which throws
  if the user's `snipe_cap` (default 15) is exceeded — enforced both client-side and by a DB
  trigger (`watchlist_enforce_cap` in the migration), so it can't be bypassed by calling the API
  directly.
- `watchlist` is keyed `(user_id, showtime_id)`: two users can star the same showtime with
  different seat-zone preferences.
- `scripts/snipe_seats.py` scrapes each **unique showtime once per cycle** (not once per
  watchlist row) via Playwright — AMC's Cloudflare blocks plain `requests` — then evaluates every
  watching user's zone independently against that single scrape. Concurrency ~5, wall-clock
  budget ~4 min per cycle; whatever isn't reached rolls to the next cycle (logged as "deferred",
  never silently dropped).
- Notification dedupe is per-`(user_id, showtime_id)` in `notifications_sent` (stores the last
  notified seat set + hash), not a single global state file — one user's alert no longer
  consumes the "new seat" event for everyone.
- Expiry: a watchlist row is skipped and deleted once its showtime is >20 min past `starts_at`.
  Since `starts_at` is UTC, this is correct regardless of theater timezone with no ET-specific
  math (the old single-tenant version needed `America/New_York` handling for exactly this reason).
- **PWA + Web Push** is the primary notification channel: the site is installable (`web/public/manifest.webmanifest`,
  `sw.js`, icons in `web/public/icons/`). `sw.js` caches nothing — it only handles `push`/`notificationclick`.
  Subscriptions live in `web_push_subscriptions` (migration `0011`, RLS own-rows); the sniper's `send_web_push`
  (pywebpush, VAPID) sends alongside Expo/ntfy and prunes 404/410 subscriptions. iOS only delivers web push to apps
  added to the Home Screen from Safari (iOS 16.4+), so install guidance is built in: `InstallBanner`, `InstallGuide`
  (shared `InstallSteps`), an onboarding `install` step, and `WebPushSetup` in Settings/onboarding (`web/src/lib/pwa.js`
  has the detection helpers). Needs `VITE_VAPID_PUBLIC_KEY` (Vercel/`web/.env`) and `VAPID_PRIVATE_KEY` +
  `VAPID_SUBJECT` (GitHub secrets). Generate keys with `npx web-push generate-vapid-keys`.
- ntfy.sh remains as a fallback channel: per-user notifications also go out via ntfy.sh: every profile gets its own random
  `ntfy_topic` (`profiles.ntfy_topic`, set at signup), and `scripts/snipe_seats.py` sends each
  alert to the watching user's own topic — the interim channel until the Expo app exists and
  `push_tokens` has real registrations (Expo Push is already wired up and will take over once
  devices register). `SNIPER_DEBUG_NTFY_TOPIC` (env var / GitHub secret) is separate — an
  optional personal mirror of every notification, for verifying the pipeline end-to-end.
- Every alert is also appended to `notification_history` (separate from the `notifications_sent`
  dedupe cache) so users can browse past alerts in Settings; rows older than 30 days are deleted
  by `expire_old_notification_history()`, called alongside `expire_past_showtimes()` every cycle.
- `sniper.yml` has **only `workflow_dispatch`** — no GitHub `schedule:`. It's triggered every ~5
  min by an external cron-job.org job.

### AMC seat page scraping

- URL: `https://www.amctheatres.com/showtimes/{showtimeId}/seats`. SSR'd — seat availability is
  in the initial HTML.
- Available seats: `input[type=checkbox]` without `disabled` inside
  `[aria-label="Seat Selection Map"]`. Seat name = row letter + number (e.g. `F22`).
- Row `I` is always excluded (skipped in AMC's own numbering), independent of any user's zone.
  Zone filtering (`row_min`/`row_max`/`seat_min`/`seat_max`) happens per-user afterward, against
  the one shared scrape — see `scripts/seat_zone.py` (a deliberate Python port of
  `shared/src/seats.js`; keep both in sync if the zone logic changes).

### Onboarding, alert history, and admin

- New signups see a first-run onboarding flow (`web/src/components/Onboarding.jsx`, gated on
  `profiles.onboarded_at` being null) — welcome, follow a theater, set up ntfy alerts. Skippable;
  skipping still marks `onboarded_at` so it isn't shown again.
- Settings shows a 30-day alert history (`AlertHistory.jsx` / `notification_history` table).
- A single hardcoded admin (`web/src/config.js` `ADMIN_EMAIL`) gets an Admin nav item and screen
  (`Admin.jsx`): pipeline health (reads GitHub's public Actions API client-side, no token
  needed since the repo is public), `app_settings` editing, waitlist promotion, and per-user
  `snipe_cap` overrides. UI gating is cosmetic only — the actual enforcement is RLS policies in
  `supabase/migrations/0005_admin_rls.sql` keyed on the same email via `auth.jwt() ->> 'email'`.

### Wishlist (movies) vs. watchlist (showtimes)

- `wishlist_movies` (migration `0010`) is per-user, keyed by AMC movie id like `hidden_movies`:
  display-only, no sniper/notification involvement. Wishlisted movies are pinned to the top of the
  main list and shown in the ♥ Wishlist view (`WishlistPanel.jsx`). Rows snapshot `movie_name`/
  `poster` so a movie still shows there after it stops playing at every followed theater.
- Don't confuse it with `watchlist` (★), which is per-showtime seat sniping.

### `seat_zone.py` / `seats.js` parity

Both implementations are tested against one shared fixture (`shared/seat_zone_fixture.json`) —
`scripts/test_seat_zone.py` and `shared/src/seats.test.mjs` (`npm run test:seats`), run in CI on
every push (`.github/workflows/test.yml`). Update the fixture, not just one side, when the
zone-matching logic changes.

### Not yet built (see the plan doc)

- The Expo app (`app/`) — screens, push registration, EAS build/TestFlight.
- Sign in with Apple.

## Secrets

- `AMC_API_KEY` — GitHub Actions secret; local key in `amc_api.txt` (gitignored, resolved
  relative to the repo root regardless of cwd).
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — GitHub Actions secrets, used only by
  `scripts/supabase_client.py`. Never in client bundles.
- `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — GitHub Actions secrets for web push (sniper only). The matching public key
  is `VITE_VAPID_PUBLIC_KEY` in Vercel / `web/.env`.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Vercel env vars (and `web/.env` locally, from
  `web/.env.example`). Safe to be public; RLS on the signed-in user's JWT is the real boundary.
- `SNIPER_DEBUG_NTFY_TOPIC` — optional, personal ntfy.sh topic for testing the sniper before the
  Expo app exists.
