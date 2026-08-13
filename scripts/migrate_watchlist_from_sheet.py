"""One-off: import the old Google Sheet watchlist into Supabase.

Run this once, after you've signed into the new web app at least once (so
your `profiles` row exists), and before deleting the Apps Script deployment.

  python3 scripts/migrate_watchlist_from_sheet.py --user-id <your-auth-uid> [--dry-run]

Parses the same "movie · theater · date · time · format" label the old
Sheet used, one last time — everything downstream of this script uses real
columns (see supabase/migrations/0001_init.sql: watchlist).
"""

import argparse
import re
import sys
from datetime import date, datetime, timezone

import requests

import supabase_client as sb

WATCHLIST_URL = 'https://script.google.com/macros/s/AKfycbxqX5--yrniT_ZrQz4WJ1CR9saTN5Q-VS9lDj7AvozqtWRiUF89Ig8ugot-b1HirfGt/exec'

# name -> amc_id, for theaters this tool ever tracked. Extend if the old
# Sheet has rows for a theater not in this list.
THEATER_NAME_TO_ID = {
    'AMC Lincoln Square 13': 2116,
    'AMC 34th Street 14': 2120,
    'AMC Kips Bay 15': 2195,
    'AMC Empire 25': 552,
}


def parse_label(name):
    """"{movie} · {theater} · {date} · {time} · {format}" -> dict, or None
    if it doesn't match (Apps Script rows were always written in this shape
    by the old web app, but tolerate garbage rather than crash)."""
    parts = [p.strip() for p in name.split('·')]
    if len(parts) < 5:
        return None
    movie, theater, date_str, time_str, fmt = parts[0], parts[1], parts[2], parts[3], '·'.join(parts[4:])
    try:
        d = date.fromisoformat(date_str)
    except ValueError:
        return None
    m = re.match(r'^(\d{1,2}):(\d{2})', time_str)
    if not m:
        return None
    hour, minute = int(m.group(1)), int(m.group(2))

    theater_id = THEATER_NAME_TO_ID.get(theater)
    if theater_id is None:
        print(f'  WARNING: unknown theater "{theater}" — skipping')
        return None

    # The old app had no timezone concept beyond "assume ET" (see CLAUDE.md).
    # Good enough for a one-time historical import.
    from zoneinfo import ZoneInfo
    starts_at = datetime(d.year, d.month, d.day, hour, minute, tzinfo=ZoneInfo('America/New_York'))

    return {
        'movie_name': movie,
        'theater_id': theater_id,
        'starts_at': starts_at.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'format': fmt,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--user-id', required=True, help='Supabase auth UID to own the imported rows')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    print('Fetching old Sheet watchlist...')
    r = requests.get(WATCHLIST_URL, timeout=20)
    r.raise_for_status()
    items = [i for i in r.json() if i.get('showtimeId')]
    print(f'{len(items)} row(s) found')

    rows = []
    for item in items:
        parsed = parse_label(item.get('name', ''))
        if not parsed:
            print(f'  skip {item["showtimeId"]}: unparseable label "{item.get("name")}"')
            continue
        rows.append({
            'user_id': args.user_id,
            'showtime_id': int(item['showtimeId']),
            'theater_id': parsed['theater_id'],
            'movie_name': parsed['movie_name'],
            'starts_at': parsed['starts_at'],
            'format': parsed['format'],
            'row_min': (item.get('rowMin') or 'E').strip().upper(),
            'row_max': (item.get('rowMax') or 'L').strip().upper(),
            'seat_min': int(item.get('seatMin') or 7),
            'seat_max': int(item.get('seatMax') or 36),
        })
        print(f'  {item["showtimeId"]}: {parsed["movie_name"]} @ {parsed["starts_at"]}')

    print(f'\n{len(rows)}/{len(items)} row(s) parsed and ready to import')
    if args.dry_run:
        print('--dry-run: not writing.')
        return 0

    if rows:
        sb.upsert('watchlist', rows, on_conflict='user_id,showtime_id')
    print('Done.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
