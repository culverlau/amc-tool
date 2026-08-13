"""Multi-user IMAX/premium-format seat sniper.

Replaces the single-tenant version: watchlist rows now live in Postgres
(one per (user, showtime)), each showtime is scraped once per cycle no matter
how many users are watching it, and each user's seat-zone preference is
evaluated independently against that single scrape. Notification dedupe is
per-user (`notifications_sent`) instead of one global sniper_state.json.

  python3 scripts/snipe_seats.py
  python3 scripts/snipe_seats.py --dry-run          # scrape + report, no DB writes, no pushes
  python3 scripts/snipe_seats.py --showtime-ids 145272580   # bypass the DB watchlist query
"""

import argparse
import hashlib
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone

import requests
from playwright.sync_api import sync_playwright

import supabase_client as sb
from seat_zone import filter_seats_to_zone, sort_seats

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

# Real per-user delivery is each user's own profiles.ntfy_topic (see
# send_ntfy / dispatch_for_row) — the interim channel until the Expo app
# ships and push_tokens has real registrations. This one is separate: an
# optional personal mirror of every notification, for verifying the pipeline
# end-to-end. Set SNIPER_DEBUG_NTFY_TOPIC to a personal ntfy.sh topic; unset
# to disable.
DEBUG_NTFY_TOPIC = os.environ.get('SNIPER_DEBUG_NTFY_TOPIC')

SKIP_ROWS = {'I'}  # skipped in AMC theater numbering — never a real row
SKIP_LABEL_KEYWORDS = {'Wheelchair Space', 'Wheelchair Companion'}

# You can still buy a ticket up to ~20 min after the posted start; past that
# the showing is dead to everyone. starts_at is a UTC timestamptz, so this
# comparison is correct regardless of the theater's timezone.
LATE_GRACE = timedelta(minutes=20)

WALL_CLOCK_BUDGET_SECONDS = 240  # leaves headroom in the ~5-min cron interval
SCRAPE_CONCURRENCY = 5

_USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
)


# --------------------------------------------------------------- watchlist

def expire_past_showtimes(dry_run=False):
    """Delete watchlist rows (any user) more than LATE_GRACE past their start,
    and the notification history that goes with them."""
    cutoff = (datetime.now(timezone.utc) - LATE_GRACE).strftime('%Y-%m-%dT%H:%M:%SZ')
    expired = sb.select('watchlist', {'select': 'showtime_id', 'starts_at': f'lte.{cutoff}'})
    if not expired:
        return
    ids = sorted({r['showtime_id'] for r in expired})
    print(f'Expiring {len(ids)} showtime(s) past start + 20min grace')
    if dry_run:
        return
    sb.delete('watchlist', {'starts_at': f'lte.{cutoff}'})
    id_list = ','.join(str(i) for i in ids)
    sb.delete('notifications_sent', {'showtime_id': f'in.({id_list})'})


ALERT_HISTORY_RETENTION = timedelta(days=30)


def expire_old_notification_history(dry_run=False):
    """User-facing alert history log — separate from notifications_sent (the
    dedupe cache expired above), so it has its own independent 30-day
    retention rather than being tied to showtime expiry."""
    cutoff = (datetime.now(timezone.utc) - ALERT_HISTORY_RETENTION).strftime('%Y-%m-%dT%H:%M:%SZ')
    old = sb.select('notification_history', {'select': 'id', 'sent_at': f'lte.{cutoff}'})
    if not old:
        return
    print(f'Expiring {len(old)} notification history row(s) older than 30 days')
    if dry_run:
        return
    sb.delete('notification_history', {'sent_at': f'lte.{cutoff}'})


def fetch_active_watchlist():
    """Rows for active users whose showtime hasn't expired yet, each carrying
    its theater's utc_offset (for notification formatting)."""
    cutoff = (datetime.now(timezone.utc) - LATE_GRACE).strftime('%Y-%m-%dT%H:%M:%SZ')
    rows = sb.select_all('watchlist', {
        'select': 'id,user_id,showtime_id,theater_id,movie_name,starts_at,format,'
                  'row_min,row_max,seat_min,seat_max,'
                  'profiles!inner(status,ntfy_topic),theaters!inner(utc_offset,name)',
        'profiles.status': 'eq.active',
        'starts_at': f'gt.{cutoff}',
        'order': 'starts_at.asc',
    })
    return rows


# ------------------------------------------------------------------ scraping

def is_sold_out(page):
    # Substring match — the banner reads "This showtime is sold out, please
    # choose another." so an exact-text locator would never match.
    try:
        return page.get_by_text('showtime is sold out', exact=False).count() > 0
    except Exception:
        return False


def fetch_available_seats(page, showtime_id):
    """Every non-disabled, non-wheelchair seat (row 'I' excluded). No zone
    filtering here — that happens per-user against this shared result.
    Returns {'seats': [...], 'sold_out': bool} or None on a real failure."""
    url = f'https://www.amctheatres.com/showtimes/{showtime_id}/seats'
    try:
        page.goto(url, wait_until='domcontentloaded', timeout=20000)
        if is_sold_out(page):
            return {'seats': [], 'sold_out': True}
        page.wait_for_selector('[aria-label="Seat Selection Map"]', timeout=10000)
    except Exception as e:
        # Sold-out pages have no seat map, so wait_for_selector times out here.
        # Re-check before treating it as a real error — a sold-out showing
        # must write [] (sold_out=True), not be skipped.
        if is_sold_out(page):
            return {'seats': [], 'sold_out': True}
        print(f'  [{showtime_id}] could not load seat map: {e}')
        return None

    raw = page.eval_on_selector_all(
        '[aria-label="Seat Selection Map"] input[type="checkbox"]',
        '''inputs => inputs
            .filter(inp => !inp.disabled && inp.name)
            .map(inp => ({ name: inp.name, label: inp.getAttribute("aria-label") }))'''
    )

    seats = []
    for s in raw:
        name = s['name']
        row = name[0].upper() if name else ''
        if row in SKIP_ROWS:
            continue
        if any(kw in (s['label'] or '') for kw in SKIP_LABEL_KEYWORDS):
            continue
        seats.append(name)

    return {'seats': sort_seats(seats), 'sold_out': False}


_thread_local = threading.local()
_thread_resources = []
_thread_resources_lock = threading.Lock()


def _get_context():
    if not hasattr(_thread_local, 'context'):
        pw = sync_playwright().start()
        browser = pw.chromium.launch(
            headless=True,
            args=['--disable-blink-features=AutomationControlled'],
        )
        context = browser.new_context(user_agent=_USER_AGENT)
        _thread_local.context = context
        with _thread_resources_lock:
            _thread_resources.append((pw, browser))
    return _thread_local.context


def _scrape_one(showtime_id):
    context = _get_context()
    page = context.new_page()
    try:
        return fetch_available_seats(page, showtime_id)
    finally:
        page.close()


def scrape_showtimes(showtime_ids):
    """Scrape each showtime once, soonest-first, under a wall-clock budget.
    Whatever isn't reached this cycle rolls to the next one. Returns
    {showtime_id: {'seats':[...], 'sold_out':bool} | None}."""
    results = {}
    deadline = time.time() + WALL_CLOCK_BUDGET_SECONDS
    deferred = []

    with ThreadPoolExecutor(max_workers=SCRAPE_CONCURRENCY) as executor:
        futures = {}
        for sid in showtime_ids:
            if time.time() >= deadline:
                deferred.append(sid)
                continue
            futures[executor.submit(_scrape_one, sid)] = sid

        for fut in as_completed(futures):
            sid = futures[fut]
            try:
                results[sid] = fut.result()
            except Exception as e:
                print(f'  [{sid}] scrape raised: {e}')
                results[sid] = None

    for pw, browser in _thread_resources:
        try:
            browser.close()
            pw.stop()
        except Exception:
            pass
    _thread_resources.clear()

    if deferred:
        print(f'Deferred {len(deferred)} showtime(s) to next cycle (wall-clock budget reached)')

    return results


# ----------------------------------------------------------- notifications

def ordinal(n):
    if 10 <= n % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix}'


def _parse_utc_offset(offset_str):
    if not offset_str:
        return timezone.utc
    sign = -1 if offset_str.strip().startswith('-') else 1
    hh, mm = offset_str.strip().lstrip('+-').split(':')
    return timezone(sign * timedelta(hours=int(hh), minutes=int(mm)))


def format_local_datetime(starts_at_iso, utc_offset):
    # starts_at_iso is UTC ("...Z"); render in the theater's local time as
    # "Fri · June 26th 2026 · 7:30 PM".
    dt_utc = datetime.fromisoformat(starts_at_iso.replace('Z', '+00:00'))
    local = dt_utc.astimezone(_parse_utc_offset(utc_offset))
    dow = local.strftime('%a')
    date_disp = f'{dow} · {local.strftime("%B")} {ordinal(local.day)} {local.year}'
    time_disp = local.strftime('%-I:%M %p')
    return f'{date_disp} · {time_disp}'


def seat_set_hash(seats):
    return hashlib.sha256(','.join(sort_seats(seats)).encode()).hexdigest()


def get_last_notification(user_id, showtime_id):
    rows = sb.select('notifications_sent', {
        'select': 'seat_set_hash,seats',
        'user_id': f'eq.{user_id}',
        'showtime_id': f'eq.{showtime_id}',
    })
    return rows[0] if rows else None


def record_notification(user_id, showtime_id, seats):
    sb.upsert('notifications_sent', [{
        'user_id': user_id,
        'showtime_id': showtime_id,
        'seat_set_hash': seat_set_hash(seats),
        'seats': seats,
        'sent_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }], on_conflict='user_id,showtime_id')


def record_notification_history(user_id, showtime_id, movie_name, seats):
    """Append-only, unlike record_notification — every alert gets its own row
    so the user can browse past alerts, not just the latest state."""
    sb.upsert('notification_history', [{
        'user_id': user_id,
        'showtime_id': showtime_id,
        'movie_name': movie_name,
        'seats': seats,
        'sent_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }])


_push_token_cache = {}


def get_push_tokens(user_id):
    if user_id not in _push_token_cache:
        rows = sb.select('push_tokens', {'select': 'expo_token', 'user_id': f'eq.{user_id}'})
        _push_token_cache[user_id] = [r['expo_token'] for r in rows]
    return _push_token_cache[user_id]


def send_expo_push(tokens, title, body):
    if not tokens:
        return
    messages = [
        {'to': t, 'title': title, 'body': body, 'sound': 'default', 'priority': 'high'}
        for t in tokens
    ]
    try:
        r = requests.post(
            EXPO_PUSH_URL,
            json=messages,
            headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
            timeout=15,
        )
        r.raise_for_status()
        receipts = (r.json() or {}).get('data', [])
        for token, receipt in zip(tokens, receipts):
            if receipt.get('status') == 'error' and receipt.get('details', {}).get('error') == 'DeviceNotRegistered':
                print(f'  pruning stale push token for expired device')
                sb.delete('push_tokens', {'expo_token': f'eq.{token}'})
    except Exception as e:
        print(f'  Expo push failed: {e}')


def send_ntfy(topic, title, body):
    """Interim per-user delivery channel until the Expo app ships and
    push_tokens has real registrations — each user subscribes to their own
    profiles.ntfy_topic in the free ntfy app."""
    if not topic:
        return
    try:
        requests.post(
            f'https://ntfy.sh/{topic}',
            data=body.encode(),
            headers={'Title': title, 'Priority': 'high', 'Tags': 'movie_camera'},
            timeout=10,
        )
    except Exception as e:
        print(f'  ntfy send failed ({topic}): {e}')


def dispatch_for_row(row, scrape_result, dry_run=False):
    """Evaluate one user's zone against a shared scrape result; notify on
    change. Returns True if a notification was (or would be) sent."""
    if scrape_result is None:
        return False  # not scraped this cycle (deferred, or scrape failed) — try again next cycle

    zone = {
        'row_min': row['row_min'], 'row_max': row['row_max'],
        'seat_min': row['seat_min'], 'seat_max': row['seat_max'],
    }
    zone_seats = filter_seats_to_zone(scrape_result['seats'], zone)

    # 'debug' user id means --showtime-ids was used to bypass the DB entirely
    # (no Supabase configured) — just report what would happen.
    is_debug = row['user_id'] == 'debug'
    last = None if is_debug else get_last_notification(row['user_id'], row['showtime_id'])
    current_hash = seat_set_hash(zone_seats)
    if last and last['seat_set_hash'] == current_hash:
        return False

    prev_seats = set(last['seats']) if last else set()
    cur_seats = set(zone_seats)
    new_seats = sorted(cur_seats - prev_seats)
    lost_seats = sorted(prev_seats - cur_seats)

    if not new_seats and not lost_seats:
        return False  # hash differed only because of ordering; nothing user-visible changed

    theater = row.get('theaters') or {}
    detail = format_local_datetime(row['starts_at'], theater.get('utc_offset'))

    if new_seats:
        body = f"{len(cur_seats)} good seat(s) open — NEW: {' '.join(new_seats)}\n{detail}"
    else:
        body = f"LOST: {' '.join(lost_seats)} — {len(cur_seats)} good seat(s) remaining\n{detail}"

    title = row['movie_name']
    print(f"  [{row['showtime_id']}] user {row['user_id']}: {body.splitlines()[0]}")

    if not dry_run and not is_debug:
        send_expo_push(get_push_tokens(row['user_id']), title, body)
        send_ntfy((row.get('profiles') or {}).get('ntfy_topic'), title, body)
        send_ntfy(DEBUG_NTFY_TOPIC, title, body)
        record_notification(row['user_id'], row['showtime_id'], zone_seats)
        record_notification_history(row['user_id'], row['showtime_id'], row['movie_name'], zone_seats)

    return True


# --------------------------------------------------------------------- main

def run(dry_run=False, showtime_id_overrides=None):
    if showtime_id_overrides:
        dry_run = True  # the debug override never has real Supabase config to write to
        showtime_ids = showtime_id_overrides
        watchlist_rows = [{
            'user_id': 'debug', 'showtime_id': sid, 'theater_id': None,
            'movie_name': str(sid), 'starts_at': datetime.now(timezone.utc).isoformat(),
            'format': None, 'row_min': 'E', 'row_max': 'L', 'seat_min': 7, 'seat_max': 36,
            'theaters': {}, 'profiles': {'status': 'active'},
        } for sid in showtime_ids]
    else:
        expire_past_showtimes(dry_run=dry_run)
        expire_old_notification_history(dry_run=dry_run)
        watchlist_rows = fetch_active_watchlist()
        showtime_ids = sorted({r['showtime_id'] for r in watchlist_rows},
                               key=lambda sid: next(r['starts_at'] for r in watchlist_rows if r['showtime_id'] == sid))

    if not showtime_ids:
        print('No active watchlist rows — nothing to snipe')
        return 0

    print(f'Scraping {len(showtime_ids)} unique showtime(s) '
          f'for {len(watchlist_rows)} watchlist row(s)...')
    results = scrape_showtimes(showtime_ids)

    if not dry_run:
        seat_rows = [
            {
                'showtime_id': sid,
                'available_seats': res['seats'],
                'sold_out': res['sold_out'],
                'scraped_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            }
            for sid, res in results.items() if res is not None
        ]
        if seat_rows:
            sb.upsert('showtime_seats', seat_rows, on_conflict='showtime_id')

    notified = 0
    for row in watchlist_rows:
        if dispatch_for_row(row, results.get(row['showtime_id']), dry_run=dry_run):
            notified += 1

    scraped_ok = sum(1 for r in results.values() if r is not None)
    print(f'\nDone. {scraped_ok}/{len(showtime_ids)} showtimes scraped, {notified} notification(s) sent.')
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='scrape and report, no DB writes or pushes')
    ap.add_argument('--showtime-ids', help='comma-separated showtime ids, bypassing the DB watchlist query')
    args = ap.parse_args()

    overrides = None
    if args.showtime_ids:
        overrides = [int(x) for x in args.showtime_ids.split(',') if x.strip()]

    return run(dry_run=args.dry_run, showtime_id_overrides=overrides)


if __name__ == '__main__':
    sys.exit(main())
