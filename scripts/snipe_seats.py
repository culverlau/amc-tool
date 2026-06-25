import re
import requests
import json
import os
from datetime import date
from playwright.sync_api import sync_playwright

WATCHLIST_URL = 'https://script.google.com/macros/s/AKfycbxqX5--yrniT_ZrQz4WJ1CR9saTN5Q-VS9lDj7AvozqtWRiUF89Ig8ugot-b1HirfGt/exec'
NTFY_URL = 'https://ntfy.sh/amc-nyc-culverlau-sniper'
STATE_FILE = 'sniper_state.json'

DEFAULT_ROW_MIN = 'E'
DEFAULT_ROW_MAX = 'L'
DEFAULT_SEAT_MIN = 7
DEFAULT_SEAT_MAX = 36
SKIP_ROWS = {'I'}  # skipped in AMC theater numbering
SKIP_LABEL_KEYWORDS = {'Wheelchair Space', 'Wheelchair Companion'}


def build_good_rows(row_min, row_max):
    start = ord(row_min.upper())
    end = ord(row_max.upper())
    return {chr(c) for c in range(start, end + 1)} - SKIP_ROWS


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {}


def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)


def fetch_watchlist():
    try:
        r = requests.get(WATCHLIST_URL, timeout=15)
        r.raise_for_status()
        return [item for item in r.json() if item.get('showtimeId')]
    except Exception as e:
        print(f'Failed to fetch watchlist: {e}')
        return None


def is_past(name):
    m = re.search(r'(\d{4}-\d{2}-\d{2})', name)
    if not m:
        return False
    return date.fromisoformat(m.group(1)) < date.today()


def remove_from_watchlist(showtime_id):
    try:
        requests.post(
            WATCHLIST_URL,
            json={'action': 'remove', 'showtimeId': showtime_id},
            timeout=15,
        )
        print('  Removed from watchlist')
    except Exception as e:
        print(f'  Could not remove: {e}')


def fetch_good_seats(page, showtime_id, good_rows, seat_min, seat_max):
    url = f'https://www.amctheatres.com/showtimes/{showtime_id}/seats'
    try:
        page.goto(url, wait_until='domcontentloaded', timeout=20000)
        if page.locator('text="This showtime is sold out"').count() > 0:
            print('  Sold out')
            return []
        page.wait_for_selector('[aria-label="Seat Selection Map"]', timeout=10000)
    except Exception as e:
        print(f'  Could not load seat map: {e}')
        print(f'  Page URL: {page.url}')
        print(f'  Page title: {page.title()}')
        return None

    seats = page.eval_on_selector_all(
        '[aria-label="Seat Selection Map"] input[type="checkbox"]',
        '''inputs => inputs
            .filter(inp => !inp.disabled && inp.name)
            .map(inp => ({ name: inp.name, label: inp.getAttribute("aria-label") }))'''
    )

    good = []
    for s in seats:
        name = s['name']
        row = name[0].upper()
        try:
            num = int(name[1:])
        except ValueError:
            continue
        if row not in good_rows:
            continue
        if num < seat_min or num > seat_max:
            continue
        if any(kw in (s['label'] or '') for kw in SKIP_LABEL_KEYWORDS):
            continue
        good.append(name)

    return sorted(good)


def notify(title, body):
    try:
        requests.post(
            NTFY_URL,
            data=body.encode(),
            headers={
                'Title': title,
                'Priority': 'high',
                'Tags': 'movie_camera',
            },
            timeout=10,
        )
        print(f'  Notified: {title}')
    except Exception as e:
        print(f'  Notification failed: {e}')


def run():
    state = load_state()
    watchlist = fetch_watchlist()

    if watchlist is None:
        return
    if not watchlist:
        print('Watchlist empty — nothing to snipe')
        return

    # Deduplicate by showtimeId
    seen_ids = set()
    unique = []
    for item in watchlist:
        sid = str(item['showtimeId'])
        if sid not in seen_ids:
            seen_ids.add(sid)
            unique.append(item)
    watchlist = unique

    print(f'Checking {len(watchlist)} starred showing(s)...')

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=['--disable-blink-features=AutomationControlled'],
        )
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        )

        for item in watchlist:
            sid = str(item['showtimeId'])
            name = item.get('name', sid)
            print(f'\n{name}')

            if is_past(name):
                print('  Showtime has passed — removing from watchlist')
                remove_from_watchlist(sid)
                state.pop(sid, None)
                continue

            row_min = (item.get('rowMin') or DEFAULT_ROW_MIN).strip().upper()
            row_max = (item.get('rowMax') or DEFAULT_ROW_MAX).strip().upper()
            seat_min = int(item.get('seatMin') or DEFAULT_SEAT_MIN)
            seat_max = int(item.get('seatMax') or DEFAULT_SEAT_MAX)
            good_rows = build_good_rows(row_min, row_max)

            page = context.new_page()
            current = fetch_good_seats(page, sid, good_rows, seat_min, seat_max)
            page.close()

            if current is None:
                print('  Seat map unavailable — skipping')
                continue

            last_seen = set(state.get(sid, []))
            current_set = set(current)
            new_seats = current_set - last_seen

            if new_seats:
                seat_str = ' '.join(sorted(new_seats))
                total = len(current_set)
                send_title = name.split('·')[0].strip()
                send_body = f'{total} good seat(s) open — NEW: {seat_str}'
                print(f'  → {send_body}')
                notify(send_title, send_body)
            else:
                print(f'  {len(current_set)} good seat(s), no change')

            state[sid] = current
            save_state(state)

        context.close()
        browser.close()


if __name__ == '__main__':
    run()
