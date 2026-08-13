#!/usr/bin/env python3
"""
Test seat_zone.py against the shared fixture also used by shared/src/seats.test.mjs.
Run from repo root:
  python3 scripts/test_seat_zone.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seat_zone import parse_seat, seat_in_zone, sort_seats

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shared', 'seat_zone_fixture.json')

PASS = '\033[92mPASS\033[0m'
FAIL = '\033[91mFAIL\033[0m'

with open(FIXTURE) as f:
    fixture = json.load(f)

passed = failed = 0


def check(label, actual, expected):
    global passed, failed
    ok = actual == expected
    print(f'{PASS if ok else FAIL}  {label}')
    if not ok:
        print(f'      expected={expected!r} actual={actual!r}')
    if ok:
        passed += 1
    else:
        failed += 1


for case in fixture['parse']:
    check(f"parse_seat({case['input']!r})", parse_seat(case['input']), case['expected'])

for case in fixture['zone']:
    check(f"seat_in_zone({case['seat']!r}, {case['zone']!r})", seat_in_zone(case['seat'], case['zone']), case['expected'])

for case in fixture['sort']:
    check(f"sort_seats({case['input']!r})", sort_seats(case['input']), case['expected'])

print(f'\n{passed} passed, {failed} failed')
sys.exit(1 if failed else 0)
