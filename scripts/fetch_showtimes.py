"""Fetch AMC showtimes for followed theaters and publish per-theater JSON.

Demand-driven: only theaters with at least one follower in `user_theaters`
are fetched (there are ~550 AMC theaters total; fetching all of them would be
~50k API calls per run). Each theater's movies/screenings are written to
their own Storage object, `showtimes/theater-{id}.json`, so a client only
downloads the theaters its user actually follows.

  python3 scripts/fetch_showtimes.py                     # fetch followed theaters, upload
  python3 scripts/fetch_showtimes.py --theater-ids 2116,552   # override the theater list
  python3 scripts/fetch_showtimes.py --dry-run            # fetch + report, no upload
  python3 scripts/fetch_showtimes.py --save-local web/public  # also write files locally
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone


def _read_key_file(path):
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and ' ' not in line and not line.startswith('http') and len(line) >= 8:
                    return line
    except Exception:
        pass
    return ""


_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Resolve the key file relative to the repo, not the cwd, so scripts work the
# same whether invoked from the repo root or from scripts/.
API_KEY = os.environ.get("AMC_API_KEY") or _read_key_file(
    os.path.join(_REPO_ROOT, "amc_api.txt")
)
BASE = "https://api.amctheatres.com"
HEADERS = {"X-AMC-Vendor-Key": API_KEY}

STORAGE_BUCKET = "showtimes"

MAX_DAYS = 365


def _parse_lang_from_attr_name(name):
    m = re.match(r'^(\w+)\s+(?:Spoken|Language)\b', name)
    return m.group(1) if m else None


def fetch_movie(movie_id):
    import requests
    try:
        r = requests.get(f"{BASE}/v2/movies/{movie_id}", headers=HEADERS, timeout=15)
        if r.status_code != 200:
            print(f'Warning: fetch_movie {movie_id} got HTTP {r.status_code}')
            return {}
        return r.json()
    except requests.Timeout:
        print(f'Warning: fetch_movie {movie_id} timed out')
        return {}
    except Exception as e:
        print(f'Warning: fetch_movie {movie_id} failed: {e}')
        return {}


def fetch_showtimes(theater_id, date_str):
    import requests
    showtimes = []
    page = 1
    while True:
        url = f"{BASE}/v2/theatres/{theater_id}/showtimes/{date_str}?pageSize=100&pageNumber={page}"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
        except requests.Timeout:
            print(f'Warning: fetch_showtimes theater={theater_id} {date_str} timed out')
            break
        except Exception as e:
            print(f'Warning: fetch_showtimes theater={theater_id} {date_str} failed: {e}')
            break
        if resp.status_code != 200:
            if resp.status_code != 404:
                print(f'Warning: fetch_showtimes theater={theater_id} {date_str} got HTTP {resp.status_code}')
            break
        data = resp.json()
        batch = data.get("_embedded", {}).get("showtimes", [])
        showtimes.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return showtimes


def get_format(showtime):
    codes = {a["code"].upper() for a in showtime.get("attributes", [])}
    # IMAX checked first — attribute codes catch IMAX 70mm where premiumFormat says "70mm"
    if "IMAX" in codes or "IMAX70MM" in codes:
        return "IMAX at AMC"
    premium = (showtime.get("premiumFormat") or "").strip()
    if premium:
        return premium
    if "DOLBY" in codes or "DOLBYATMOS" in codes:
        return "Dolby Cinema at AMC"
    if "LASERATAMC" in codes:
        return "Laser at AMC"
    if "SCREENX" in codes:
        return "ScreenX"
    if "70MM" in codes:
        return "70mm"
    if "4DX" in codes:
        return "4DX"
    return "Standard"


def has_open_caption(showtime):
    # OPENCAPTION = subtitles burned onto the screen for everyone. (CLOSEDCAPTION
    # is just "a caption device is available" and sits on most showtimes — noise.)
    codes = {a["code"].upper() for a in showtime.get("attributes", [])}
    return "OPENCAPTION" in codes


def detect_languages(showtime):
    langs = set()
    for a in showtime.get("attributes", []):
        lang = _parse_lang_from_attr_name(a.get("name", ""))
        if lang:
            langs.add(lang)
    return sorted(langs) if langs else ["English"]


def get_followed_theaters():
    """Theater id -> name, for every theater with >=1 follower."""
    import supabase_client as sb

    follows = sb.select_all("user_theaters", {"select": "amc_id"})
    ids = sorted({row["amc_id"] for row in follows})
    if not ids:
        return {}

    return lookup_theater_names(ids)


def lookup_theater_names(ids):
    """Theater id -> real name from the `theaters` table, falling back to a
    placeholder only for ids `sync_theaters.py` hasn't synced yet (e.g. a
    brand-new AMC location)."""
    import supabase_client as sb

    if not ids:
        return {}

    id_list = ",".join(str(i) for i in ids)
    theaters = sb.select("theaters", {"select": "amc_id,name", "amc_id": f"in.({id_list})"})
    names = {t["amc_id"]: t["name"] for t in theaters}
    return {i: names.get(i, f"AMC Theatre {i}") for i in ids}


def fetch_theater(theater_id, theater_name, movie_cache, skipped):
    """Fetch all upcoming showtimes for one theater. `movie_cache` and
    `skipped` are shared across theaters in this run so a movie playing at
    several followed theaters is only looked up once."""
    movies = {}
    today = date.today()
    days_checked = 0

    for offset in range(MAX_DAYS):
        d = today + timedelta(days=offset)
        date_str = d.strftime("%Y-%m-%d")
        days_checked = offset + 1

        showtimes = fetch_showtimes(theater_id, date_str)
        time.sleep(0.1)

        # No early-exit on empty days: advance/fan-event sales for a single
        # far-out date (e.g. a tentpole release months away) can appear with
        # a long stretch of otherwise-empty days in between — bailing out
        # after a few empty days silently drops those. See MAX_DAYS above for
        # the actual backstop.
        if not showtimes:
            continue

        for s in showtimes:
            mid = s["movieId"]
            if mid in skipped:
                continue
            if not s.get("showDateTimeUtc"):
                print(f'Warning: showtime {s.get("id")} missing showDateTimeUtc, skipping')
                continue

            if mid not in movie_cache:
                movie_api = fetch_movie(mid)
                time.sleep(0.1)
                if movie_api.get("availableForAList") is False:
                    skipped.add(mid)
                    continue
                movie_cache[mid] = movie_api
            movie_api = movie_cache[mid]

            if mid not in movies:
                release_year = (movie_api.get("releaseDateUtc") or "")[:4] or None
                movies[mid] = {
                    "id": mid,
                    "name": s["movieName"],
                    "genre": s.get("genre", ""),
                    "mpaaRating": s.get("mpaaRating", ""),
                    "runTime": s.get("runTime", 0),
                    "releaseYear": release_year,
                    "poster": (s.get("media") or {}).get("posterDynamic", ""),
                    "formats": set(),
                    "languages": set(),
                    "scores": {},
                    "screenings": [],
                }

            fmt = get_format(s)
            movies[mid]["formats"].add(fmt)
            for lang in detect_languages(s):
                movies[mid]["languages"].add(lang)

            # date_str is AMC's *business* day: a 12:30am show is returned by
            # the query for the previous calendar date, which is how we want it
            # grouped. "time" is local wall-clock for display. "startsAt" is
            # showDateTimeUtc — a true UTC instant, not showDateTimeLocal (which
            # has no offset attached) — so it stores correctly as a timestamptz
            # and sorts/compares correctly regardless of the theater's timezone.
            # This is also what becomes watchlist.starts_at.
            movies[mid]["screenings"].append({
                "showtimeId": s["id"],
                "theaterId": theater_id,
                "theaterName": theater_name,
                "date": date_str,
                "time": s["showDateTimeLocal"][11:16],
                "startsAt": s["showDateTimeUtc"],
                "format": fmt,
                "hasOC": has_open_caption(s),
                "isSoldOut": s.get("isSoldOut", False),
                "isAlmostSoldOut": s.get("isAlmostSoldOut", False),
                "purchaseUrl": s.get("purchaseUrl", ""),
                # layoutId is stable per physical auditorium (confirmed against
                # AMC's live API) — scripts/scrape_layouts.py uses it to cache a
                # room's seat-layout range once instead of per showtime.
                "auditorium": s.get("auditorium"),
                "layoutId": s.get("layoutId"),
            })

    for m in movies.values():
        m["formats"] = sorted(m["formats"])
        m["languages"] = sorted(m["languages"])

    movie_list = sorted(
        movies.values(),
        key=lambda m: min(s["date"] + s["time"] for s in m["screenings"])
    )

    return movie_list, days_checked


def run(theater_overrides=None, dry_run=False, save_local=None):
    if theater_overrides:
        theaters = theater_overrides
    else:
        theaters = get_followed_theaters()

    if not theaters:
        print("No followed theaters — nothing to fetch.")
        return 0

    print(f"Fetching {len(theaters)} theater(s): {list(theaters.values())}")

    movie_cache = {}
    skipped = set()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    index = {}

    if save_local:
        os.makedirs(save_local, exist_ok=True)

    for theater_id, theater_name in theaters.items():
        print(f"\n{theater_name} ({theater_id})...")
        movie_list, days_checked = fetch_theater(theater_id, theater_name, movie_cache, skipped)
        print(f"  {len(movie_list)} movies across {days_checked} days checked")

        output = {
            "lastUpdated": now,
            "theaters": {str(theater_id): theater_name},
            "movies": movie_list,
        }
        payload = json.dumps(output)
        filename = f"theater-{theater_id}.json"

        if save_local:
            with open(os.path.join(save_local, filename), "w") as f:
                f.write(payload)

        if not dry_run:
            import supabase_client as sb
            sb.storage_upload(STORAGE_BUCKET, filename, payload)
            sb.update("theaters", {"amc_id": f"eq.{theater_id}"}, {"last_fetched_at": now})

        index[str(theater_id)] = {
            "name": theater_name,
            "lastUpdated": now,
            "movieCount": len(movie_list),
        }

    index_payload = json.dumps({"lastUpdated": now, "theaters": index})
    if save_local:
        with open(os.path.join(save_local, "index.json"), "w") as f:
            f.write(index_payload)
    if not dry_run:
        import supabase_client as sb
        sb.storage_upload(STORAGE_BUCKET, "index.json", index_payload)

    print(f"\nDone. {len(theaters)} theater file(s) {'written locally' if save_local else ''}"
          f"{' and ' if save_local and not dry_run else ''}"
          f"{'uploaded to Storage' if not dry_run else ''}.")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--theater-ids", help="comma-separated AMC theater ids, bypassing the Supabase follower query")
    ap.add_argument("--dry-run", action="store_true", help="fetch and report, skip Storage upload")
    ap.add_argument("--save-local", metavar="DIR", help="also write theater-{id}.json/index.json to DIR")
    args = ap.parse_args()

    if not API_KEY:
        print("Error: no AMC API key (set AMC_API_KEY or provide amc_api.txt)")
        return 1

    overrides = None
    if args.theater_ids:
        ids = [int(x) for x in args.theater_ids.split(",") if x.strip()]
        overrides = lookup_theater_names(ids)

    return run(theater_overrides=overrides, dry_run=args.dry_run, save_local=args.save_local)


if __name__ == "__main__":
    sys.exit(main())
