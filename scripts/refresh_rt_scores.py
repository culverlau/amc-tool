#!/usr/bin/env python3
"""
Refresh RT scores for movies that are missing from cache or were previously
found but not yet reviewed. Runs separately from the main fetch/deploy so it
doesn't block the 6-hour showtime update.
"""
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_showtimes import (
    THEATERS, fetch_movie, fetch_showtimes as _fetch_showtimes,
    scrape_rt, fetch_rt_cache, upsert_rt_score,
)


def run():
    today = date.today()
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print("Fetching RT cache...")
    rt_cache = fetch_rt_cache()
    print(f"  {len(rt_cache)} cached entries")

    # Collect current movies (title + release_year) from AMC API.
    # Only need the next 14 days to cover everything currently showing.
    seen = set()
    to_refresh = []  # (mid, name, release_year)

    for offset in range(14):
        d = today + timedelta(days=offset)
        date_str = d.strftime("%Y-%m-%d")
        for theater_id in THEATERS:
            for s in _fetch_showtimes(theater_id, date_str):
                mid = s["movieId"]
                if mid in seen:
                    continue
                seen.add(mid)
                amc_id_str = str(mid)
                cached = rt_cache.get(amc_id_str)
                needs_refresh = (
                    not cached                                      # never scraped
                    or (cached.get('rtSlug') and cached.get('rtScore') is None)  # unscored slug
                )
                if needs_refresh:
                    movie_api = fetch_movie(mid)
                    release_year = (movie_api.get("releaseDateUtc") or "")[:4] or None
                    to_refresh.append((mid, s["movieName"], release_year))
                    time.sleep(0.1)

    print(f"{len(to_refresh)} movies need RT refresh")

    updated = 0
    for mid, name, release_year in to_refresh:
        rt_score, rt_slug = scrape_rt(name, release_year)
        if rt_score is not None or rt_slug:
            upsert_rt_score(mid, name, rt_score, rt_slug, now_str)
            updated += 1
        time.sleep(1)

    print(f"Done — {updated} cache entries updated")


if __name__ == "__main__":
    run()
