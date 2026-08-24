"""Cache each followed theater's per-auditorium seat-layout range (row/seat
min-max), scraped once per (theater, layoutId) and reused forever.

AMC's showtime API tags every showtime with `auditorium` and `layoutId`, and
layoutId is stable per physical room — the same auditorium always reports the
same layoutId regardless of movie/date. So the seat-layout range only needs
scraping once per (theater, layoutId), not per showtime and not per star —
see fetch_showtimes.py's screening dict and supabase/migrations/0007_seat_layouts.sql.

  python3 scripts/scrape_layouts.py                       # all followed theaters
  python3 scripts/scrape_layouts.py --theater-ids 2116     # override the theater list
  python3 scripts/scrape_layouts.py --dry-run              # scrape + report, no DB writes
"""

import argparse
import sys
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

import supabase_client as sb
from browser_utils import launch_browser_context
from fetch_showtimes import get_followed_theaters, STORAGE_BUCKET
from seat_zone import derive_layout_range
from snipe_seats import is_sold_out, SKIP_ROWS


def fetch_layout_seats(page, showtime_id):
    """Every seat position in the auditorium regardless of disabled state or
    wheelchair-space label — the true physical grid extent, not availability.
    Unlike fetch_available_seats (snipe_seats.py), a sold/held/wheelchair seat
    still occupies a real row/seat position and must count toward the range.
    Row 'I' is still excluded (never a real row in AMC's own numbering).
    Returns a list of seat names, or None if the page couldn't be scraped."""
    url = f'https://www.amctheatres.com/showtimes/{showtime_id}/seats'
    try:
        page.goto(url, wait_until='domcontentloaded', timeout=20000)
        if is_sold_out(page):
            return None
        page.wait_for_selector('[aria-label="Seat Selection Map"]', timeout=10000)
    except Exception as e:
        if is_sold_out(page):
            return None
        print(f'  [{showtime_id}] could not load seat map: {e}')
        return None

    raw = page.eval_on_selector_all(
        '[aria-label="Seat Selection Map"] input[type="checkbox"]',
        '''inputs => inputs
            .filter(inp => inp.name)
            .map(inp => inp.name)'''
    )
    return [name for name in raw if name and name[0].upper() not in SKIP_ROWS]


def get_existing_layouts():
    """Set of (theater_id, layout_id) pairs already cached."""
    rows = sb.select_all('seat_layouts', {'select': 'theater_id,layout_id'})
    return {(r['theater_id'], r['layout_id']) for r in rows}


def find_candidates(theater_id, existing):
    """(theater_id, layout_id) -> [showtimeId,...] for every uncached layout
    in this theater's latest fetched showtime data, soonest/not-sold-out
    first. Returns {} if the theater has no fetched data yet."""
    try:
        payload = sb.storage_download(STORAGE_BUCKET, f'theater-{theater_id}.json')
    except sb.SupabaseError as e:
        print(f'  [{theater_id}] no showtime data yet, skipping: {e}')
        return {}

    candidates = {}
    for movie in payload.get('movies', []):
        for s in movie.get('screenings', []):
            layout_id = s.get('layoutId')
            if layout_id is None:
                continue
            key = (theater_id, layout_id)
            if key in existing:
                continue
            candidates.setdefault(key, []).append(s)

    for key in candidates:
        candidates[key].sort(key=lambda s: s.get('isSoldOut', False))
    return candidates


def scrape_and_upsert(context, key, screenings, dry_run):
    theater_id, layout_id = key
    for s in screenings:
        page = context.new_page()
        try:
            seats = fetch_layout_seats(page, s['showtimeId'])
        finally:
            page.close()
        if seats is None:
            continue  # sold out or unreachable — try the next candidate
        layout_range = derive_layout_range(seats)
        if layout_range is None:
            print(f'  [{theater_id}/{layout_id}] no parseable seats found, skipping')
            return False
        print(f'  [{theater_id}/{layout_id}] rows {layout_range["row_min"]}-{layout_range["row_max"]}, '
              f'seats {layout_range["seat_min"]}-{layout_range["seat_max"]}')
        if not dry_run:
            sb.upsert('seat_layouts', [{
                'theater_id': theater_id,
                'layout_id': layout_id,
                **layout_range,
                'scraped_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            }], on_conflict='theater_id,layout_id')
        return True

    print(f'  [{theater_id}/{layout_id}] deferred: all {len(screenings)} candidate showtime(s) '
          f'sold out, retrying next run')
    return False


def run(theater_overrides=None, dry_run=False):
    theaters = theater_overrides or get_followed_theaters()
    if not theaters:
        print('No followed theaters — nothing to scrape.')
        return 0

    existing = get_existing_layouts()
    all_candidates = {}
    for theater_id in theaters:
        all_candidates.update(find_candidates(theater_id, existing))

    if not all_candidates:
        print('No uncached layouts found — nothing to scrape.')
        return 0

    print(f'Scraping {len(all_candidates)} uncached layout(s)...')
    with sync_playwright() as pw:
        browser, context = launch_browser_context(pw)
        try:
            for key, screenings in all_candidates.items():
                scrape_and_upsert(context, key, screenings, dry_run)
        finally:
            browser.close()

    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--theater-ids', help='comma-separated AMC theater ids, bypassing the Supabase follower query')
    ap.add_argument('--dry-run', action='store_true', help='scrape and report, skip DB writes')
    args = ap.parse_args()

    overrides = None
    if args.theater_ids:
        ids = [int(x) for x in args.theater_ids.split(',') if x.strip()]
        overrides = {i: None for i in ids}

    return run(theater_overrides=overrides, dry_run=args.dry_run)


if __name__ == '__main__':
    sys.exit(main())
