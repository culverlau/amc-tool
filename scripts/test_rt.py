#!/usr/bin/env python3
"""
Test RT matching logic against live RT. Run from repo root:
  python3 scripts/test_rt.py
"""
import re
import html as html_module
import requests
import time
from datetime import date

RT_HEADERS = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'}
CURRENT_YEAR = date.today().year

# ---------------------------------------------------------------------------
# Core helpers (mirrors what we want in fetch_showtimes.py)
# ---------------------------------------------------------------------------

def _rt_normalize(t):
    t = html_module.unescape(t)
    t = t.replace('–', '-').replace('—', '-')
    return t.lower().strip()

def _remove_articles(s):
    s = re.sub(r'\b(the|a|an)\s+', '', s)
    return re.sub(r'\s+', ' ', s).strip()

def _titles_match(search_norm, rt_norm):
    return (rt_norm == search_norm
            or rt_norm.startswith(search_norm + ' ')
            or search_norm.startswith(rt_norm + ' '))

def _strip_rerelease_suffix(title):
    t = re.sub(r'\s*[-–]\s*\d+(?:st|nd|rd|th)?\s+anniversary\b.*', '', title, flags=re.IGNORECASE)
    t = re.sub(r'\s+\d+(?:st|nd|rd|th)?\s+anniversary\b.*', '', t, flags=re.IGNORECASE)
    t = re.sub(r'\s+celebrates\b.*', '', t, flags=re.IGNORECASE)
    return t.strip()

def _parse_rt_blocks(blocks):
    results = []
    for block in blocks:
        score_m = re.search(r'tomatometer-score="(\d+)"', block)
        year_m  = re.search(r'release-year="(\d+)"', block)
        slug_m  = re.search(r'href="https://www\.rottentomatoes\.com(/m/[^"]+)"', block)
        title_m = re.search(r'alt="([^"]+)"', block)
        if not (slug_m and title_m):
            continue
        results.append({
            'rt_title': _rt_normalize(title_m.group(1)),
            'rt_year':  int(year_m.group(1)) if year_m else None,
            'score':    int(score_m.group(1)) if score_m else None,
            'slug':     slug_m.group(1),
        })
    return results

_FOUND_UNSCORED = object()  # sentinel: film exists on RT but has no score yet

def _find_rt_match(rt_results, search_title, release_year, strip_arts=False):
    """
    Returns: result dict  — scored match found
             _FOUND_UNSCORED — correct film found but no score yet (stop; don't fall through)
             None            — no title match at all
    """
    raw_norm    = _rt_normalize(search_title)
    search_norm = _remove_articles(raw_norm) if strip_arts else raw_norm
    amc_year    = int(release_year) if release_year else None

    title_matches = []
    for r in rt_results:
        rt_cmp = _remove_articles(r['rt_title']) if strip_arts else r['rt_title']
        if _titles_match(search_norm, rt_cmp):
            title_matches.append(r)

    if not title_matches:
        return None

    # Current-year AMC: first figure out if this is a new film or a re-release
    if amc_year and amc_year >= CURRENT_YEAR:
        recent = next(
            (r for r in title_matches if r['rt_year'] and abs(r['rt_year'] - CURRENT_YEAR) <= 2),
            None
        )
        if recent is not None:
            # RT has a current-era entry → this is a new film; use it or stop
            return recent if recent['score'] is not None else _FOUND_UNSCORED
        # No recent RT entry → old film getting a re-run; fall through to year-agnostic

    # Year-tolerant (older AMC year) or year-agnostic (re-release path above)
    for r in title_matches:
        if amc_year and r['rt_year'] and amc_year < CURRENT_YEAR:
            if abs(r['rt_year'] - amc_year) > 2:
                continue
        return r if r['score'] is not None else _FOUND_UNSCORED

    return None


def scrape_rt(title, release_year=None):
    try:
        resp = requests.get(
            'https://www.rottentomatoes.com/search',
            params={'search': title},
            headers=RT_HEADERS,
            timeout=10,
        )
        rt_results = _parse_rt_blocks(re.split(r'<search-page-media-row', resp.text)[1:])
        cleaned = _strip_rerelease_suffix(title)

        attempts = [(title, False), (title, True)]
        if cleaned != title:
            attempts += [(cleaned, False), (cleaned, True)]

        for search_title, strip_arts in attempts:
            match = _find_rt_match(rt_results, search_title, release_year, strip_arts=strip_arts)
            if match is _FOUND_UNSCORED:
                return None, None
            if match is not None:
                return match['score'], match['slug']
    except Exception as e:
        print(f'  [exception: {e}]')
    return None, None


# ---------------------------------------------------------------------------
# Test cases: (amc_title, amc_release_year, expected, note)
# expected = int score, or None (no score expected), or 'any' (just needs a score)
# ---------------------------------------------------------------------------
TESTS = [
    # Re-releases with anniversary suffixes
    ('Amores Perros 25th Anniversary',                          '2026', 'any',  'prefix match + re-release'),
    ('The Fast and the Furious 25th Anniversary',               '2026', 'any',  'prefix match + re-release'),
    ('Talladega Nights: Ballad of Ricky Bobby - 20th Anniversary', '2026', 'any', 'article diff: "The Ballad"'),
    ('Mob Psycho 100 Celebrates Its 10th Anniversary',          '2026', None,  'no RT film entry expected'),

    # Clean-title re-releases (no anniversary suffix)
    ('The Lego Movie',       '2026', 'any',  'exact title, re-release 2014'),
    ('Muppet Treasure Island','2026', 'any', 'exact title, re-release 1996'),

    # New 2026 films — must NOT grab old film with same name
    ('Supergirl',   '2026', None, 'new 2026 film; 1984 version (19%) is wrong match'),
    ('Toy Story 5', '2026', 'any', 'new 2026 film with score'),

    # Non-rerelease older film (control)
    ('The Lego Movie 2: The Second Part', '2019', 'any', 'non-rerelease control'),

    # Current-year new films
    ('How to Train Your Dragon', '2026', 'any', '2025 remake should win over 2010 original'),
    ('F1',                       '2026', 'any', 'RT has "F1 The Movie"'),
]

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
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
    if ok:
        passed += 1
    else:
        failed += 1
    time.sleep(0.8)

print(f'\n{passed} passed, {failed} failed')
