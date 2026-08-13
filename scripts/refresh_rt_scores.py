#!/usr/bin/env python3
"""Refresh Rotten Tomatoes scores for movies at followed theaters.

Movie list comes from the theater JSON files already sitting in Storage
(written by fetch_showtimes.py) rather than a fresh AMC API scan — those
files are typically only hours old, and scanning again would double the AMC
API load for no reason. Falls back to a live AMC scan of followed theaters
if a theater's Storage file isn't available yet (e.g. newly followed).
"""
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_showtimes import get_followed_theaters, fetch_movie, fetch_showtimes as _fetch_showtimes, STORAGE_BUCKET
from rt_scraper import scrape_rt, fetch_rt_cache, upsert_rt_score, cleanup_rt_cache
import supabase_client as sb


def _parse_movies(data):
    return [(m['id'], m['name'], m.get('releaseYear')) for m in data['movies']]


def load_movies_from_storage(theater_ids):
    """Merge movie lists out of each followed theater's Storage file.
    Returns None if any followed theater has no file yet — that's the signal
    to fall back to a live scan rather than silently under-covering."""
    if not sb.SUPABASE_URL:
        return None

    by_id = {}
    for tid in theater_ids:
        url = f'{sb.SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/theater-{tid}.json'
        try:
            r = requests.get(url, timeout=15)
            if r.status_code != 200:
                print(f'  no Storage file yet for theater {tid} (HTTP {r.status_code})')
                return None
            for mid, name, year in _parse_movies(r.json()):
                by_id[mid] = (mid, name, year)
        except Exception as e:
            print(f'  WARNING: could not fetch theater {tid} from Storage: {e}')
            return None

    movies = list(by_id.values())
    print(f'  loaded {len(movies)} movies from Storage ({len(theater_ids)} theater file(s))')
    return movies


def load_movies_from_amc_api(theaters):
    print(f"  scanning AMC API (next 90 days across {len(theaters)} theaters)...")
    seen = set()
    movies = []
    consecutive_empty = 0

    for offset in range(90):
        d = date.today() + timedelta(days=offset)
        date_str = d.strftime("%Y-%m-%d")
        any_results = False
        for theater_id in theaters:
            try:
                showtimes = _fetch_showtimes(theater_id, date_str)
            except Exception as e:
                print(f"  ERROR fetching theater {theater_id} on {date_str}: {e}")
                continue
            for s in showtimes:
                mid = s["movieId"]
                name = s["movieName"]
                if mid in seen:
                    continue
                seen.add(mid)
                try:
                    movie_api = fetch_movie(mid)
                    if movie_api.get("availableForAList") is False:
                        continue
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
        print("  WARNING: cache is empty — either Supabase is unreachable or no entries exist yet")
    else:
        print(f"  {len(rt_cache)} cached entries")

    print("\nLoading followed theaters...")
    theaters = get_followed_theaters()
    if not theaters:
        print("  no followed theaters — nothing to refresh")
        return

    print("Loading movie list...")
    movies = load_movies_from_storage(list(theaters.keys())) or load_movies_from_amc_api(theaters)
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
