import re
import requests
import json
import os
import time
from datetime import date, datetime
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
    # Apps Script returns intermittent 500s; retry before giving up so a single
    # transient error doesn't skip the entire run (and leave seats unwritten).
    last_err = None
    for attempt in range(4):
        try:
            r = requests.get(WATCHLIST_URL, timeout=20)
            r.raise_for_status()
            return [item for item in r.json() if item.get('showtimeId')]
        except Exception as e:
            last_err = e
            if attempt < 3:
                time.sleep(2 * (attempt + 1))
    print(f'Failed to fetch watchlist after retries: {last_err}')
    return None


def is_past(name):
    m = re.search(r'(\d{4}-\d{2}-\d{2})', name)
    if not m:
        return False
    return date.fromisoformat(m.group(1)) < date.today()


def ordinal(n):
    if 10 <= n % 100 <= 20:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix}'


def format_detail(date_part, time_part):
    # date_part is "YYYY-MM-DD", time_part is 24h "HH:MM" — render as
    # "Fri · June 26th 2026 · 7:30 PM" for the notification body.
    date_disp = date_part
    if date_part:
        try:
            d = date.fromisoformat(date_part)
            dow = d.strftime('%a')  # Mon, Tue, ...
            date_disp = f'{dow} · {d.strftime("%B")} {ordinal(d.day)} {d.year}'
        except ValueError:
            pass
    time_disp = time_part
    if time_part:
        m = re.match(r'^(\d{1,2}):(\d{2})', time_part)
        if m:
            try:
                time_disp = datetime.strptime(m.group(0), '%H:%M').strftime('%-I:%M %p')
            except ValueError:
                pass
    return ' · '.join(filter(None, [date_disp, time_disp]))


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


def update_sheet_seats(showtime_id, seats):
    payload = {'action': 'updateSeats', 'showtimeId': showtime_id, 'seats': ','.join(seats)}
    for attempt in range(3):
        try:
            r = requests.post(WATCHLIST_URL, json=payload, timeout=20)
            r.raise_for_status()
            return
        except Exception as e:
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
            else:
                print(f'  Could not update sheet seats: {e}')


def is_sold_out(page):
    # Substring match — the banner reads "This showtime is sold out, please
    # choose another." so an exact-text locator would never match.
    try:
        return page.get_by_text('showtime is sold out', exact=False).count() > 0
    except Exception:
        return False


def fetch_good_seats(page, showtime_id, good_rows, seat_min, seat_max):
    url = f'https://www.amctheatres.com/showtimes/{showtime_id}/seats'
    try:
        page.goto(url, wait_until='domcontentloaded', timeout=20000)
        if is_sold_out(page):
            print('  Sold out — no good seats')
            return []
        page.wait_for_selector('[aria-label="Seat Selection Map"]', timeout=10000)
    except Exception as e:
        # Sold-out pages have no seat map, so wait_for_selector times out here.
        # Re-check for the sold-out banner before treating it as a real error —
        # a sold-out showing must return [] (writes empty) not None (skips write).
        if is_sold_out(page):
            print('  Sold out — no good seats')
            return []
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
            lost_seats = last_seen - current_set

            parts = [p.strip() for p in name.split('·')]
            movie = (
                next((p for p in parts if p and not re.match(r'^\d{4}-', p) and 'AMC' not in p and ':' not in p), None)
                or next((p for p in parts if p and not re.match(r'^\d{4}-', p) and ':' not in p), None)
                or sid
            )
            date_part = next((p for p in parts if re.match(r'^\d{4}-\d{2}-\d{2}$', p)), '')
            time_part = next((p for p in parts if re.match(r'^\d{1,2}:\d{2}', p)), '')
            detail = format_detail(date_part, time_part)

            if new_seats:
                seat_str = ' '.join(sorted(new_seats))
                total = len(current_set)
                send_body = f'{total} good seat(s) open — NEW: {seat_str}'
                if detail:
                    send_body += f'\n{detail}'
                print(f'  → {send_body}')
                notify(movie, send_body)
            elif lost_seats:
                lost_str = ' '.join(sorted(lost_seats))
                remaining = len(current_set)
                send_body = f'LOST: {lost_str} — {remaining} good seat(s) remaining'
                if detail:
                    send_body += f'\n{detail}'
                print(f'  → {send_body}')
                notify(movie, send_body)
            else:
                print(f'  {len(current_set)} good seat(s) — no change')

            state[sid] = current
            save_state(state)
            update_sheet_seats(sid, current)

        context.close()
        browser.close()


if __name__ == '__main__':
    run()
