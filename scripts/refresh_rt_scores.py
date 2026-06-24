#!/usr/bin/env python3
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_showtimes import THEATERS, fetch_movie, fetch_showtimes as _fetch_showtimes
from rt_scraper import scrape_rt, fetch_rt_cache, upsert_rt_score, cleanup_rt_cache


def run():
    today = date.today()
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print("Fetching RT cache...")
    rt_cache = fetch_rt_cache()
    if not rt_cache:
        print("  WARNING: cache is empty — either Sheets is down or no entries exist yet")
    else:
        print(f"  {len(rt_cache)} cached entries")

    seen = set()
    to_refresh = []

    print(f"\nScanning AMC showtimes (next 14 days across {len(THEATERS)} theaters)...")
    for offset in range(14):
        d = today + timedelta(days=offset)
        date_str = d.strftime("%Y-%m-%d")
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
                is_fathom = "EVENT" in attr_codes
                if is_world_cup or is_fathom:
                    continue
                if mid in seen:
                    continue
                seen.add(mid)
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

                try:
                    movie_api = fetch_movie(mid)
                except Exception as e:
                    print(f'  ERROR fetching movie {mid} ({name}): {e}')
                    continue
                release_year = (movie_api.get("releaseDateUtc") or "")[:4] or None
                print(f'  queue "{name}" ({mid}, {release_year}) — {reason}')
                to_refresh.append((mid, name, release_year))
                time.sleep(0.1)

    print(f"\n{len(seen)} movies found on AMC, {len(to_refresh)} need RT refresh\n")

    updated = 0
    for mid, name, release_year in to_refresh:
        rt_score, rt_slug = scrape_rt(name, release_year)
        if rt_score is not None or rt_slug:
            try:
                upsert_rt_score(mid, name, rt_score, rt_slug, now_str)
                updated += 1
            except Exception as e:
                print(f'  ERROR upserting {name}: {e}')
        time.sleep(1)

    print(f"\nDone — {updated} entries updated")

    print("Cleaning up stale cache entries...")
    try:
        cleanup_rt_cache(list(seen))
    except Exception as e:
        print(f"  ERROR during cleanup: {e}")


if __name__ == "__main__":
    run()
