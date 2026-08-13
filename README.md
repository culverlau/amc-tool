# AMC Showtimes

Browse AMC showtimes at any theater you follow, star any showing, and get a push notification
when seats open up in your preferred zone.

Multi-user: everyone gets their own account, followed theaters, watchlist, and seat-zone
preferences. Currently mid-migration from a single-tenant personal tool — see
`CLAUDE.md` for the current architecture and what's left to build.

## Stack

- **Web**: React + Vite + Tailwind, deployed on Vercel
- **Mobile**: Expo / React Native (iOS + Android) — not yet built
- **Backend**: Supabase (Postgres + Auth + Row Level Security), no application server
- **Data jobs**: Python, run on a schedule via GitHub Actions

## Setup

### 1. Supabase

Create a project at [supabase.com](https://supabase.com), then:
- Run the migration in `supabase/migrations/0001_init.sql` (SQL editor, or the CLI)
- Create a public Storage bucket named `showtimes`
- Enable the Google auth provider

### 2. Secrets

GitHub Actions (**Settings → Secrets and variables → Actions**):

| Name | Value |
|------|-------|
| `AMC_API_KEY` | AMC vendor API key |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (never expose client-side) |

`web/.env` (see `web/.env.example`) / Vercel project env vars:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon key (safe to be public) |

### 3. Vercel

Import the repo — `vercel.json` at the repo root points the build at the `web` workspace.
Deploys automatically on every push to `main`.

### 4. First data fetch

A theater only gets fetched once someone follows it, so seed at least one follow (star a
theater in the app, or insert a row into `user_theaters` directly), then run **Actions → Fetch
Showtimes → Run workflow** once manually.

## Local development

```bash
npm install
npm run dev            # web dev server at localhost:5173
```

```bash
pip install -r scripts/requirements.txt
python3 -m playwright install chromium

python3 scripts/fetch_showtimes.py    # fetch followed theaters
python3 scripts/sync_theaters.py      # refresh the theater directory
python3 scripts/snipe_seats.py        # run the seat sniper once
```

Both Python scripts accept `--dry-run` and an override flag (`--theater-ids`,
`--showtime-ids`) to test against live AMC data without touching Supabase.

## How it works

**Showtimes** — `fetch_showtimes.py` runs every 6 hours, fetching only theaters at least one
user follows, and writes one JSON file per theater to Supabase Storage. Clients merge just the
files for theaters they follow.

**Seat sniper** — Triggered every ~5 minutes (via an external cron-job.org call to
`workflow_dispatch` — there's no GitHub `schedule:` for this one). Scrapes each starred showtime
once regardless of how many users are watching it, evaluates every user's seat-zone preference
against that one scrape, and sends a push notification on change. Showings past their start time
are automatically removed from the watchlist.
