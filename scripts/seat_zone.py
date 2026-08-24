"""Seat-zone helpers — Python port of shared/src/seats.js.

Kept in lockstep with the JS version by having the same test in both:
scripts/test_seat_zone.py and (as a fork of this logic) the JS unit checks.
"""

import re

_SEAT_RE = re.compile(r'^([A-Za-z]+)(\d+)$')


def parse_seat(name):
    m = _SEAT_RE.match(str(name).strip())
    if not m:
        return None
    return {"row": m.group(1).upper(), "number": int(m.group(2))}


def seat_in_zone(name, zone):
    seat = parse_seat(name)
    if not seat:
        return False
    row_min = str(zone.get("row_min", "")).upper()
    row_max = str(zone.get("row_max", "")).upper()
    try:
        seat_min = int(zone.get("seat_min"))
        seat_max = int(zone.get("seat_max"))
    except (TypeError, ValueError):
        return False

    if len(seat["row"]) < len(row_min) or len(seat["row"]) > len(row_max):
        return False
    if seat["row"] < row_min or seat["row"] > row_max:
        return False
    return seat_min <= seat["number"] <= seat_max


def filter_seats_to_zone(seats, zone):
    return [s for s in (seats or []) if seat_in_zone(s, zone)]


def sort_seats(seats):
    def key(s):
        p = parse_seat(s)
        return (p["row"], p["number"]) if p else (s, 0)
    return sorted(seats or [], key=key)


def derive_layout_range(seats):
    """Min/max row+seat spanning every real seat position in a raw
    (unfiltered) seat list. Excludes row 'I' (AMC skips it in its own
    numbering — never a real row). Row comparison uses (len(row), row) so
    double-letter rows (e.g. 'AA') sort after all single-letter rows,
    matching seat_in_zone()'s existing length-then-lexicographic rule."""
    parsed = [p for p in (parse_seat(s) for s in (seats or [])) if p and p["row"] != "I"]
    if not parsed:
        return None
    rows = [p["row"] for p in parsed]
    return {
        "row_min": min(rows, key=lambda r: (len(r), r)),
        "row_max": max(rows, key=lambda r: (len(r), r)),
        "seat_min": min(p["number"] for p in parsed),
        "seat_max": max(p["number"] for p in parsed),
    }
