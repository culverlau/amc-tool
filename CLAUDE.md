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

## Architecture

This was originally a single-tenant personal tool (one Google Sheet, 4 hardcoded NYC theaters,
GitHub Pages). It's being converted to multi-user: individual accounts, each with their own
followed theaters (any AMC nationwide), watchlist, and seat-zone preferences, with mobile push
as the only notification channel. See `/Users/culver/.claude/plans/so-i-think-i-hashed-thunder.md`
for the full plan this migration follows.

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
- Notifications go out via Expo Push (`push_tokens` table) — **once the Expo app exists**. Until
  then, `SNIPER_DEBUG_NTFY_TOPIC` (env var / GitHub secret) optionally mirrors notifications to a
  personal ntfy.sh topic for testing the pipeline end-to-end.
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

### Not yet built (see the plan doc)

- The Expo app (`app/`) — screens, push registration, EAS build/TestFlight.
- Web push / Sign in with Apple.
- Google OAuth provider configuration in the live Supabase project (needs a Google Cloud OAuth
  client — the one unavoidable piece of GCP for this project).

## Secrets

- `AMC_API_KEY` — GitHub Actions secret; local key in `amc_api.txt` (gitignored, resolved
  relative to the repo root regardless of cwd).
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — GitHub Actions secrets, used only by
  `scripts/supabase_client.py`. Never in client bundles.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Vercel env vars (and `web/.env` locally, from
  `web/.env.example`). Safe to be public; RLS on the signed-in user's JWT is the real boundary.
- `SNIPER_DEBUG_NTFY_TOPIC` — optional, personal ntfy.sh topic for testing the sniper before the
  Expo app exists.
