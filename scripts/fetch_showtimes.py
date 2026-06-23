import re
import html as html_module
import requests
import json
import os
import time
from datetime import date, datetime, timedelta, timezone

CURRENT_YEAR = date.today().year

def _read_key_file(path):
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                # A key has no spaces, isn't a URL, and is at least 8 chars
                if line and ' ' not in line and not line.startswith('http') and len(line) >= 8:
                    return line
    except Exception:
        pass
    return ""

API_KEY = os.environ.get("AMC_API_KEY") or _read_key_file("amc_api.txt")
BASE = "https://api.amctheatres.com"
HEADERS = {"X-AMC-Vendor-Key": API_KEY}

APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxqX5--yrniT_ZrQz4WJ1CR9saTN5Q-VS9lDj7AvozqtWRiUF89Ig8ugot-b1HirfGt/exec'
RT_HEADERS = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'}

THEATERS = {
    2116: "AMC Lincoln Square 13",
    2120: "AMC 34th Street 14",
    2195: "AMC Kips Bay 15",
    552: "AMC Empire 25",
}

def _parse_lang_from_attr_name(name):
    m = re.match(r'^(\w+)\s+(?:Spoken|Language)\b', name)
    return m.group(1) if m else None


def _rt_normalize(t):
    t = html_module.unescape(t)
    t = t.replace('–', '-').replace('—', '-')  # en/em dash → hyphen
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


_FOUND_UNSCORED = object()  # film found on RT but no tomatometer score yet


def _find_rt_match(rt_results, search_title, release_year, strip_arts=False):
    """
    Returns a result dict if a scored match is found, _FOUND_UNSCORED if the correct
    film is on RT but has no score yet, or None if no title match at all.
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

    # Current-year AMC: check for a recent RT entry to distinguish new film vs re-release.
    # If a recent RT entry exists → new film; use it or stop (don't fall through to old films).
    # If no recent RT entry → old film being re-run; fall through to year-agnostic matching.
    if amc_year and amc_year >= CURRENT_YEAR:
        recent = next(
            (r for r in title_matches if r['rt_year'] and abs(r['rt_year'] - CURRENT_YEAR) <= 2),
            None
        )
        if recent is not None:
            return recent if recent['score'] is not None else _FOUND_UNSCORED

    for r in title_matches:
        if amc_year and r['rt_year'] and amc_year < CURRENT_YEAR:
            if abs(r['rt_year'] - amc_year) > 2:
                continue
        return r if r['score'] is not None else _FOUND_UNSCORED

    return None


def scrape_rt(title, release_year=None):
    try:
        r = requests.get(
            'https://www.rottentomatoes.com/search',
            params={'search': title},
            headers=RT_HEADERS,
            timeout=10,
        )
        rt_results = _parse_rt_blocks(re.split(r'<search-page-media-row', r.text)[1:])
        cleaned = _strip_rerelease_suffix(title)

        # Four attempts in order of confidence: original title / suffix-stripped,
        # each with and without article normalization ("The Ballad" vs "Ballad")
        attempts = [(title, False), (title, True)]
        if cleaned != title:
            attempts += [(cleaned, False), (cleaned, True)]

        for search_title, strip_arts in attempts:
            match = _find_rt_match(rt_results, search_title, release_year, strip_arts=strip_arts)
            if match is _FOUND_UNSCORED:
                return None, None
            if match is not None:
                return match['score'], match['slug']
    except Exception:
        pass
    return None, None


def fetch_rt_cache():
    try:
        r = requests.get(APPS_SCRIPT_URL, params={'sheet': 'scores'}, timeout=15)
        return {item['amcId']: {'rtScore': item.get('rtScore'), 'rtSlug': item.get('rtSlug')} for item in r.json()}
    except Exception:
        return {}


def upsert_rt_score(amc_id, title, rt_score, rt_slug, now_str):
    try:
        requests.post(
            APPS_SCRIPT_URL,
            json={'action': 'upsertScore', 'amcId': str(amc_id), 'title': title, 'rtScore': rt_score, 'rtSlug': rt_slug or '', 'fetchedAt': now_str},
            timeout=15,
        )
    except Exception as e:
        print(f'Warning: could not upsert RT score for {title}: {e}')


def cleanup_rt_cache(amc_ids):
    try:
        requests.post(
            APPS_SCRIPT_URL,
            json={'action': 'cleanupScores', 'amcIds': [str(i) for i in amc_ids]},
            timeout=15,
        )
    except Exception as e:
        print(f'Warning: could not cleanup RT cache: {e}')


def fetch_movie(movie_id):
    r = requests.get(f"{BASE}/v2/movies/{movie_id}", headers=HEADERS, timeout=15)
    return r.json() if r.status_code == 200 else {}


def fetch_showtimes(theater_id, date_str):
    showtimes = []
    page = 1
    while True:
        url = f"{BASE}/v2/theatres/{theater_id}/showtimes/{date_str}?pageSize=100&pageNumber={page}"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            break
        data = resp.json()
        batch = data.get("_embedded", {}).get("showtimes", [])
        showtimes.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return showtimes


def get_format(showtime):
    codes = {a["code"].upper() for a in showtime.get("attributes", [])}
    # IMAX checked first — attribute codes catch IMAX 70mm where premiumFormat says "70mm"
    if "IMAX" in codes or "IMAX70MM" in codes:
        return "IMAX at AMC"
    premium = (showtime.get("premiumFormat") or "").strip()
    if premium:
        return premium
    if "DOLBY" in codes or "DOLBYATMOS" in codes:
        return "Dolby Cinema at AMC"
    if "LASERATAMC" in codes:
        return "Laser at AMC"
    if "SCREENX" in codes:
        return "ScreenX"
    if "70MM" in codes:
        return "70mm"
    if "4DX" in codes:
        return "4DX"
    return "Standard"


def detect_languages(showtime):
    langs = set()
    for a in showtime.get("attributes", []):
        lang = _parse_lang_from_attr_name(a.get("name", ""))
        if lang:
            langs.add(lang)
    return sorted(langs) if langs else ["English"]


def run():
    movies = {}
    today = date.today()
    consecutive_empty = 0
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print("Fetching RT score cache...")
    rt_cache = fetch_rt_cache()
    print(f"  {len(rt_cache)} cached scores")

    for offset in range(90):
        d = today + timedelta(days=offset)
        date_str = d.strftime("%Y-%m-%d")
        any_results = False

        for theater_id, theater_name in THEATERS.items():
            showtimes = fetch_showtimes(theater_id, date_str)
            time.sleep(0.1)  # gentle rate limiting

            if showtimes:
                any_results = True

            for s in showtimes:
                mid = s["movieId"]
                attr_codes = {a["code"].upper() for a in s.get("attributes", [])}
                name = s["movieName"]
                is_world_cup = "COPA MUNDIAL" in name.upper() or (
                    "FIFA" in name.upper() and "TELEMUNDO" in name.upper()
                )

                if mid not in movies:
                    movie_api = fetch_movie(mid)
                    time.sleep(0.1)

                    amc_id_str = str(mid)
                    is_fathom = "EVENT" in attr_codes
                    release_year = (movie_api.get("releaseDateUtc") or "")[:4] or None
                    cached = rt_cache.get(amc_id_str)
                    if is_world_cup or is_fathom:
                        rt_score, rt_slug = None, None
                    elif cached and cached.get('rtScore') is not None:
                        rt_score = cached['rtScore']
                        rt_slug = cached.get('rtSlug')
                    else:
                        rt_score, rt_slug = scrape_rt(name, release_year)
                        if rt_score is not None:
                            upsert_rt_score(mid, name, rt_score, rt_slug, now_str)
                            rt_cache[amc_id_str] = {'rtScore': rt_score, 'rtSlug': rt_slug}
                        time.sleep(1)

                    movies[mid] = {
                        "id": mid,
                        "name": name,
                        "genre": s.get("genre", ""),
                        "mpaaRating": s.get("mpaaRating", ""),
                        "runTime": s.get("runTime", 0),
                        "releaseYear": release_year,
                        "poster": (s.get("media") or {}).get("posterDynamic", ""),
                        "formats": set(),
                        "languages": set(),
                        "isFathom": False,
                        "isWorldCup": is_world_cup,
                        "availableForAList": movie_api.get("availableForAList", True),
                        "scores": {"rt": rt_score, "rtSlug": rt_slug},
                        "screenings": [],
                    }

                fmt = get_format(s)
                movies[mid]["formats"].add(fmt)
                for lang in detect_languages(s):
                    movies[mid]["languages"].add(lang)
                if "EVENT" in attr_codes:
                    movies[mid]["isFathom"] = True

                movies[mid]["screenings"].append({
                    "showtimeId": s["id"],
                    "theaterId": theater_id,
                    "theaterName": theater_name,
                    "date": date_str,
                    "time": s["showDateTimeLocal"][11:16],
                    "format": fmt,
                    "isSoldOut": s.get("isSoldOut", False),
                    "isAlmostSoldOut": s.get("isAlmostSoldOut", False),
                    "purchaseUrl": s.get("purchaseUrl", ""),
                })

        if not any_results:
            consecutive_empty += 1
            if consecutive_empty >= 3:
                break
        else:
            consecutive_empty = 0

    print("Cleaning up stale RT cache entries...")
    clean_ids = [mid for mid, m in movies.items() if not m['isFathom'] and not m['isWorldCup']]
    cleanup_rt_cache(clean_ids)

    # Convert sets to sorted lists
    for m in movies.values():
        m["formats"] = sorted(m["formats"])
        m["languages"] = sorted(m["languages"])

    # Sort by earliest screening date+time
    movie_list = sorted(
        movies.values(),
        key=lambda m: min(s["date"] + s["time"] for s in m["screenings"])
    )

    output = {
        "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "theaters": {str(k): v for k, v in THEATERS.items()},
        "movies": movie_list,
    }

    os.makedirs("public", exist_ok=True)
    with open("public/data.json", "w") as f:
        json.dump(output, f)

    print(f"Wrote {len(movie_list)} movies across {offset + 1} days checked")


if __name__ == "__main__":
    run()
