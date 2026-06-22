import re
import requests
import json
import os
import time
from datetime import date, datetime, timedelta, timezone

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


def scrape_rt(title, release_year=None):
    try:
        r = requests.get(
            'https://www.rottentomatoes.com/search',
            params={'search': title},
            headers=RT_HEADERS,
            timeout=10,
        )
        blocks = re.findall(r'href="https://www\.rottentomatoes\.com(/m/[^"]+)"[^>]*>.*?tomatometer-score="(\d+)".*?alt="([^"]+)"', r.text, re.DOTALL)
        title_lower = title.lower()
        for slug, score, found_title in blocks:
            if found_title.lower() != title_lower:
                continue
            if release_year:
                slug_years = re.findall(r'_(\d{4})(?:[/_]|$)', slug)
                if slug_years and abs(int(slug_years[0]) - int(release_year)) > 2:
                    continue
            return int(score), slug
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
                    if is_world_cup or is_fathom:
                        rt_score, rt_slug = None, None
                    elif amc_id_str in rt_cache:
                        rt_score = rt_cache[amc_id_str]['rtScore']
                        rt_slug = rt_cache[amc_id_str]['rtSlug']
                    else:
                        rt_score, rt_slug = scrape_rt(name, release_year)
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
