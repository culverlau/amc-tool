# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server at localhost:5173
npm run build        # production build → dist/
npm run fetch-data   # fetch live showtimes into public/data.json (uses hardcoded key for local dev only)
python3 scripts/snipe_seats.py   # run seat sniper manually
```

Python dependencies for scripts: `pip install requests playwright beautifulsoup4` + `python3 -m playwright install chromium`

## Architecture

**Two independent systems share this repo:**

### 1. Screening overview site (static)
- `scripts/fetch_showtimes.py` — hits the AMC Developer API (`api.amctheatres.com`, auth via `X-AMC-Vendor-Key` header) for 4 NYC theaters, writes `public/data.json`
- `src/` — React + Vite + Tailwind SPA that reads `public/data.json` at runtime via `fetch(BASE_URL + 'data.json')`
- `VITE_BASE_PATH` must be set to `/{repo-name}/` at build time
- **Two deploy paths to GitHub Pages** (both build with `VITE_BASE_PATH`):
  - `deploy.yml` — runs on **every push to `main`**; curls the live `data.json` first so a push doesn't wipe data, then builds + deploys. This is why pushing to main publishes the frontend immediately.
  - `update-and-deploy.yml` — runs on a 6-hour schedule (and manual dispatch); re-fetches `data.json` from the AMC API, then builds + deploys.
  - `refresh-rt.yml` — daily; refreshes RT scores in the Sheet.
- The watchlist is a hash route: `…/#watchlist` deep-links straight to it.

### 2. IMAX seat sniper
- `scripts/snipe_seats.py` — reads a Google Sheets watchlist, scrapes AMC seat pages with Playwright (plain `requests` is blocked by Cloudflare), finds available seats in the preferred zone, sends ntfy.sh push notifications, and writes the current available seats back to the Sheet (`updateSeats` action)
- `sniper.yml` has **only `workflow_dispatch`** — there is no GitHub `schedule:` cron. It is triggered every ~5 minutes by an **external cron-job.org job** that calls the workflow dispatch. (So sniper runs show up as `workflow_dispatch`, not `schedule`.)
- Sniper state persists between runs via `actions/cache`

### Data flow
```
AMC API → fetch_showtimes.py → public/data.json → React UI
Google Sheet (watchlist) → snipe_seats.py → AMC seat pages → ntfy.sh notification
```

### Key data details
- Theater IDs: Lincoln Square 13 = 2116, 34th Street 14 = 2120, Kips Bay 15 = 2195, Empire 25 = 552
- Language detection: AMC's `languages` field is always `{}` — language is parsed from `attributes[].name` via regex `r'^(\w+)\s+(?:Spoken|Language)\b'`
- A-List eligibility: `availableForAList` boolean from `/v2/movies/{id}` endpoint (movie level, not showtime level)
- Fathom events: detected via `EVENT` attribute code on the showtime
- `public/data.json` is gitignored (generated artifact)

### Watchlist / star button
- Stars only appear on Lincoln Square IMAX showtimes (`theaterId === 2116 && format.includes('IMAX')`)
- Clicking a star POSTs to a Google Apps Script web app which reads/writes a Google Sheet
- The site reads the watchlist on load to restore star state across devices
- Preferred snipe zone: rows E–L, seats 7–36

### Google Apps Script + Sheet (the watchlist backend)
- Source of truth lives in `scripts/appscript.gs` — a **mirror** of the deployed script. Editing this file does nothing on its own; you must paste it into the Apps Script editor.
- **GOTCHA (cost real debugging time):** the live web app is pinned to a numbered *deployed version*. Editing + saving the script does **not** update the live endpoint — you must Deploy → Manage deployments → edit → **New version**. The URL stays the same. If GET/POST behavior doesn't match the code, this is almost always why.
- **Watchlist sheet is positional, no header row.** Columns: `A` showtimeId, `B` name (`movie · theater · date · time · format`), `C` rowMin, `D` rowMax, `E` seatMin, `F` seatMax, `G` availableSeats (comma-separated, written by the sniper's `updateSeats` action).
- `doGet` returns the watchlist rows as JSON (incl. `availableSeats`); `?sheet=scores` returns the RT Scores tab.
- `doPost` actions: `add`, `remove`, `updateSeats` (watchlist) and `upsertScore`, `cleanupScores` (Scores tab).
- Sniper → Sheet seat states the UI renders: missing field → "Seat data not yet available"; `''` → "No good seats open right now"; comma list → green seat chips. A sold-out showtime writes `''` (it returns `[]`, not skipped).

### AMC seat page scraping
- URL: `https://www.amctheatres.com/showtimes/{showtimeId}/seats`
- Page is SSR'd — seat availability is in the initial HTML
- Available seats: `input[type=checkbox]` without `disabled` inside `[aria-label="Seat Selection Map"]`
- Seat name format: row letter + number (e.g. `F22`); `aria-label` contains type ("AMC Club Rocker F22", "Occupied AMC Club Rocker B24")
- Cloudflare blocks plain `requests` — must use Playwright

## Secrets
- `AMC_API_KEY` — GitHub Actions secret, never commit; local key is in `amc_api.txt` (gitignored)
- Google Apps Script URL and ntfy.sh topic are hardcoded in their respective scripts (personal tool, low sensitivity)
