#!/usr/bin/env python3
"""
Test RT matching logic against live RT. Run from repo root:
  python3 scripts/test_rt.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rt_scraper import scrape_rt

TESTS = [
    # Re-releases with anniversary suffixes
    ('Amores Perros 25th Anniversary',                               '2026', 'any',  'prefix match + re-release'),
    ('The Fast and the Furious 25th Anniversary',                    '2026', 'any',  'prefix match + re-release'),
    ('Talladega Nights: Ballad of Ricky Bobby - 20th Anniversary',   '2026', 'any',  'article diff: "The Ballad"'),
    ('Mob Psycho 100 Celebrates Its 10th Anniversary',               '2026', None,   'no RT film entry expected'),

    # Clean-title re-releases (no anniversary suffix)
    ('The Lego Movie',        '2026', 'any', 'exact title, re-release 2014'),
    ('Muppet Treasure Island', '2026', 'any', 'exact title, re-release 1996'),

    # New 2026 films — must NOT grab old film with same name
    ('Supergirl',   '2026', None,  'new 2026 film; 1984 version (19%) is wrong match'),
    ('Toy Story 5', '2026', 'any', 'new 2026 film with score'),

    # Non-rerelease control
    ('The Lego Movie 2: The Second Part', '2019', 'any', 'non-rerelease control'),

    # Current-year new films
    ('How to Train Your Dragon', '2026', 'any', '2025 remake should win over 2010 original'),
    ('F1',                       '2026', 'any', 'RT has "F1 The Movie"'),
]

PASS = '\033[92mPASS\033[0m'
FAIL = '\033[91mFAIL\033[0m'

passed = failed = 0
for title, year, expected, note in TESTS:
    score, slug = scrape_rt(title, year)
    if expected == 'any':
        ok = score is not None
    elif expected is None:
        ok = score is None
    else:
        ok = score == expected

    status = PASS if ok else FAIL
    score_str = str(score) if score is not None else 'None'
    print(f'{status}  {title!r}  →  {score_str}  ({slug or "no slug"})  [{note}]')
    passed += ok
    failed += not ok
    time.sleep(0.8)

print(f'\n{passed} passed, {failed} failed')
