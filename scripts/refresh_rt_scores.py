#!/usr/bin/env python3
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_showtimes import THEATERS, fetch_movie, fetch_showtimes as _fetch_showtimes
from rt_scraper import scrape_rt, fetch_rt_cache, upsert_rt_score, cleanup_rt_cache

DATA_JSON_LOCAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data.json')
DATA_JSON_URL = os.environ.get('DATA_JSON_URL')


def _parse_movies(data):
    return [
        (m['id'], m['name'], m.get('releaseYear'))
        for m in data['movies']
        if not m.get('isFathom') and not m.get('isWorldCup')
    ]


def load_movies_from_data_json():
    # Try local file first
    try:
        with open(DATA_JSON_LOCAL) as f:
            movies = _parse_movies(json.load(f))
        print(f"  loaded {len(movies)} movies from local data.json")
        return movies
    except FileNotFoundError:
        pass
    except Exception as e:
        print(f"  WARNING: could not read local data.json: {e}")

    # Try live URL
    if DATA_JSON_URL:
        try:
            import requests as _requests
            r = _requests.get(DATA_JSON_URL, timeout=15)
            if r.status_code == 200:
                movies = _parse_movies(r.json())
                print(f"  loaded {len(movies)} movies from {DATA_JSON_URL}")
                return movies
            print(f"  WARNING: {DATA_JSON_URL} returned HTTP {r.status_code}")
        except Exception as e:
            print(f"  WARNING: could not fetch {DATA_JSON_URL}: {e}")

    return None


def load_movies_from_amc_api():
    print(f"  scanning AMC API (next 90 days across {len(THEATERS)} theaters)...")
    seen = set()
    movies = []
    consecutive_empty = 0

    for offset in range(90):
        d = date.today() + timedelta(days=offset)
        date_str = d.strftime("%Y-%m-%d")
        any_results = False
        for theater_id in THEATERS:
            try:
                showtimes = _fetch_showtimes(theater_id, date_str)
            except Exception as e:
                print(f"  ERROR fetching theater {theater_id} on {date_str}: {e}")
                continue
            for s in showtimes:
                mid = s["movieId"]
                name = s["movieName"]
                attr_codes = {a["code"].upper() for a in s.get("attributes", [])}
                is_world_cup = "COPA MUNDIAL" in name.upper() or (
                    "FIFA" in name.upper() and "TELEMUNDO" in name.upper()
                )
                if is_world_cup or "EVENT" in attr_codes:
                    continue
                if mid in seen:
                    continue
                seen.add(mid)
                try:
                    movie_api = fetch_movie(mid)
                    release_year = (movie_api.get("releaseDateUtc") or "")[:4] or None
                except Exception as e:
                    print(f"  ERROR fetching movie {mid} ({name}): {e}")
                    release_year = None
                movies.append((mid, name, release_year))
                time.sleep(0.1)
            if showtimes:
                any_results = True
        if not any_results:
            consecutive_empty += 1
            if consecutive_empty >= 3:
                break
        else:
            consecutive_empty = 0

    print(f"  found {len(movies)} movies from AMC API")
    return movies


def run():
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print("Fetching RT cache...")
    rt_cache = fetch_rt_cache()
    if not rt_cache:
        print("  WARNING: cache is empty — either Sheets is down or no entries exist yet")
    else:
        print(f"  {len(rt_cache)} cached entries")

    print("\nLoading movie list...")
    movies = load_movies_from_data_json() or load_movies_from_amc_api()
    all_ids = [mid for mid, _, _ in movies]

    to_refresh = []
    for mid, name, release_year in movies:
        cached = rt_cache.get(str(mid))
        if not cached:
            reason = 'not in cache'
        elif cached.get('rtSlug') and cached.get('rtScore') is None:
            reason = f'unscored slug {cached["rtSlug"]}'
        else:
            score = cached.get('rtScore')
            slug = cached.get('rtSlug') or 'no slug'
            print(f'  skip  "{name}" ({mid}) — score={score} {slug}')
            continue
        print(f'  queue "{name}" ({mid}, {release_year}) — {reason}')
        to_refresh.append((mid, name, release_year))

    print(f"\n{len(movies)} movies total, {len(to_refresh)} need RT refresh\n")

    updated = 0
    for mid, name, release_year in to_refresh:
        rt_score, rt_slug = scrape_rt(name, release_year)
        if rt_score is not None or rt_slug:
            try:
                upsert_rt_score(mid, name, rt_score, rt_slug, now_str)
                updated += 1
            except Exception as e:
                print(f'  ERROR upserting "{name}": {e}')
        time.sleep(1)

    print(f"\nDone — {updated} entries updated")

    print("Cleaning up stale cache entries...")
    try:
        cleanup_rt_cache(all_ids)
    except Exception as e:
        print(f"  ERROR during cleanup: {e}")


if __name__ == "__main__":
    run()
