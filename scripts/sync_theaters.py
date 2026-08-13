"""Populate the `theaters` table from AMC's theater directory.

Runs weekly. The table is what the in-app theater picker searches, and what
fetch_showtimes.py joins against to decide which theaters anyone follows.

  python3 scripts/sync_theaters.py            # sync to Supabase
  python3 scripts/sync_theaters.py --dry-run  # fetch + report, no writes
"""

import argparse
import sys
import time

import requests

from fetch_showtimes import BASE, HEADERS, API_KEY
import supabase_client as sb

PAGE_SIZE = 100


def fetch_all_theaters():
    """Page through /v2/theatres. Returns the raw AMC records."""
    theaters = []
    page = 1
    while True:
        url = f"{BASE}/v2/theatres?pageSize={PAGE_SIZE}&pageNumber={page}"
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20)
        except requests.RequestException as e:
            print(f"Error: page {page} request failed: {e}")
            break

        if resp.status_code != 200:
            print(f"Error: page {page} got HTTP {resp.status_code}")
            break

        payload = resp.json()
        batch = payload.get("_embedded", {}).get("theatres", [])
        if not batch:
            break

        theaters.extend(batch)
        count = payload.get("count")
        print(f"  page {page}: {len(batch)} theaters ({len(theaters)}/{count})")

        if count is not None and len(theaters) >= count:
            break
        page += 1
        time.sleep(0.2)

    return theaters


def to_row(t):
    """Map an AMC theater record onto the `theaters` table shape."""
    loc = t.get("location") or {}
    city = loc.get("city") or ""
    return {
        "amc_id": t["id"],
        "name": t.get("longName") or t.get("name"),
        "slug": t.get("slug"),
        # AMC returns cities uppercased ("SAINT LOUIS"); title-case for display.
        "city": city.title() if city.isupper() else city,
        "state": loc.get("state"),
        "latitude": loc.get("latitude"),
        "longitude": loc.get("longitude"),
        "timezone": t.get("timezone"),
        "utc_offset": t.get("utcOffset"),
    }


def is_usable(t):
    """Skip theaters nobody can buy a ticket for — they'd be dead entries in
    the picker and would waste showtime fetches if followed."""
    return not t.get("isClosed") and t.get("ticketable") != "Never"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="fetch and report, write nothing")
    args = ap.parse_args()

    if not API_KEY:
        print("Error: no AMC API key (set AMC_API_KEY or provide amc_api.txt)")
        return 1

    print("Fetching AMC theater directory...")
    raw = fetch_all_theaters()
    if not raw:
        print("Error: no theaters returned; refusing to touch the table")
        return 1

    usable = [t for t in raw if is_usable(t)]
    rows = [to_row(t) for t in usable]
    skipped = len(raw) - len(usable)

    print(f"\n{len(raw)} theaters fetched, {skipped} skipped (closed or non-ticketable)")
    print(f"{len(rows)} to sync")

    states = sorted({r["state"] for r in rows if r.get("state")})
    print(f"states covered: {len(states)}")
    missing_loc = [r["amc_id"] for r in rows if not r.get("city") or not r.get("state")]
    if missing_loc:
        print(f"warning: {len(missing_loc)} rows missing city/state: {missing_loc[:10]}")

    if args.dry_run:
        print("\n--dry-run: not writing. Sample rows:")
        for r in rows[:5]:
            print(f"  {r['amc_id']:>5}  {r['name']}  ({r['city']}, {r['state']})  {r['timezone']}")
        return 0

    print("\nUpserting into Supabase...")
    for i in range(0, len(rows), 500):
        chunk = rows[i : i + 500]
        sb.upsert("theaters", chunk, on_conflict="amc_id")
        print(f"  {i + len(chunk)}/{len(rows)}")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
