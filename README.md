# AMC NYC

All screenings across AMC Lincoln Square 13, 34th Street 14, Empire 25, and Kips Bay 15 — in one filterable view. Includes an IMAX seat sniper that watches specific showings and sends a push notification when good seats open up.

## Features

- Browse all NYC AMC showtimes across 4 theaters in one place
- Filter by theater, format (IMAX, Dolby, 70mm, etc.), and language
- Toggles to hide World Cup screenings, Fathom events, and non-A-List shows
- Star a Lincoln Square IMAX showing to add it to the seat sniper watchlist
- Push notification to your phone when seats open in your preferred zone (rows E–L, seats 7–36)

## Setup

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/culverlau/amc-tool.git
git push -u origin main
```

### 2. Add secrets

In your repo: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|-------|
| `AMC_API_KEY` | Your AMC vendor API key |

### 3. Enable GitHub Pages

**Settings → Pages → Source: GitHub Actions**

### 4. Run the first workflow manually

**Actions → Update Data & Deploy → Run workflow**

Site will be live at `https://culverlau.github.io/amc-tool/`

## How it works

**Showtimes** — A Python script hits the AMC Developer API every 6 hours, writes `public/data.json`, and GitHub Actions builds and deploys the static site.

**Seat sniper** — Every 5 minutes, a separate GitHub Actions workflow reads your Google Sheets watchlist, launches a headless Chromium browser (to bypass Cloudflare), scrapes the AMC seat selection page for each starred showing, and sends an ntfy.sh push notification if new seats appear in your preferred zone. Past showings are automatically removed from the watchlist.

## Local development

```bash
npm install
npm run fetch-data   # pulls live data into public/data.json
npm run dev          # dev server at localhost:5173
```

To run the seat sniper locally:
```bash
pip install requests playwright
python3 -m playwright install chromium
python3 scripts/snipe_seats.py
```

## Notifications

Uses [ntfy.sh](https://ntfy.sh). Install the ntfy app on your phone and subscribe to your topic to receive push notifications when seats open.
