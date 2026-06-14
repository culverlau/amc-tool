import re
import requests
import json
import os
import time
from datetime import date, datetime, timedelta, timezone

API_KEY = os.environ["AMC_API_KEY"]
BASE = "https://api.amctheatres.com"
HEADERS = {"X-AMC-Vendor-Key": API_KEY}

THEATERS = {
    2116: "AMC Lincoln Square 13",
    2120: "AMC 34th Street 14",
    2195: "AMC Kips Bay 15",
    552: "AMC Empire 25",
}

def _parse_lang_from_attr_name(name):
    m = re.match(r'^(\w+)\s+(?:Spoken|Language)\b', name)
    return m.group(1) if m else None


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
    premium = (showtime.get("premiumFormat") or "").strip()
    if premium:
        return premium
    codes = {a["code"].upper() for a in showtime.get("attributes", [])}
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
                    movies[mid] = {
                        "id": mid,
                        "name": name,
                        "genre": s.get("genre", ""),
                        "mpaaRating": s.get("mpaaRating", ""),
                        "runTime": s.get("runTime", 0),
                        "poster": (s.get("media") or {}).get("posterDynamic", ""),
                        "formats": set(),
                        "languages": set(),
                        "isFathom": False,
                        "isWorldCup": is_world_cup,
                        "availableForAList": movie_api.get("availableForAList", True),
                        "score": movie_api.get("score", 0),
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
