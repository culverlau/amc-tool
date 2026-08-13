import html as html_module
import re

import requests

import supabase_client as sb

RT_HEADERS = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'}


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


def _find_rt_match(rt_results, search_title, release_year, strip_arts=False):
    search_norm = _rt_normalize(search_title)
    if strip_arts:
        search_norm = _remove_articles(search_norm)
    amc_year = int(release_year) if release_year else None

    title_matches = []
    for r in rt_results:
        rt_cmp = _remove_articles(r['rt_title']) if strip_arts else r['rt_title']
        if _titles_match(search_norm, rt_cmp):
            title_matches.append(r)

    if not title_matches:
        return None

    if amc_year:
        close = next((r for r in title_matches if r['rt_year'] and abs(r['rt_year'] - amc_year) <= 2), None)
        if close:
            return close

    return title_matches[0]


def scrape_rt(title, release_year=None):
    try:
        r = requests.get(
            'https://www.rottentomatoes.com/search',
            params={'search': title},
            headers=RT_HEADERS,
            timeout=10,
        )
        if r.status_code != 200:
            print(f'  RT [http {r.status_code}] "{title}" — RT may be rate limiting')
            return None, None

        rt_results = _parse_rt_blocks(re.split(r'<search-page-media-row', r.text)[1:])

        if not rt_results:
            print(f'  RT [no results] "{title}" ({release_year}) — 0 search results returned (blocked?)')
            return None, None

        cleaned = _strip_rerelease_suffix(title)
        attempt_labels = [
            (title,   False, 'exact'),
            (title,   True,  'articles'),
        ]
        if cleaned != title:
            attempt_labels += [
                (cleaned, False, 'suffix'),
                (cleaned, True,  'suffix+articles'),
            ]

        for search_title, strip_arts, label in attempt_labels:
            match = _find_rt_match(rt_results, search_title, release_year, strip_arts=strip_arts)
            if match is not None:
                if match['score'] is None:
                    print(f'  RT [{label}] "{title}" ({release_year}) → unscored {match["slug"]}')
                else:
                    print(f'  RT [{label}] "{title}" ({release_year}) → {match["score"]} {match["slug"]}')
                return match['score'], match['slug']

        print(f'  RT [no match] "{title}" ({release_year}) — {len(rt_results)} results: {[r["rt_title"] for r in rt_results[:5]]}')
    except requests.Timeout:
        print(f'  RT [timeout] "{title}" — RT did not respond within 10s')
    except requests.RequestException as e:
        print(f'  RT [network error] "{title}": {e}')
    except Exception as e:
        print(f'  RT [error] "{title}": {e}')
    return None, None


def fetch_rt_cache():
    """amcId (str) -> {'rtScore', 'rtSlug'}, from the movie_scores table."""
    try:
        rows = sb.select_all('movie_scores', {'select': 'amc_id,rt_score,rt_slug'})
        return {
            str(r['amc_id']): {'rtScore': r.get('rt_score'), 'rtSlug': r.get('rt_slug')}
            for r in rows
        }
    except sb.SupabaseError as e:
        print(f'Warning: fetch_rt_cache failed: {e}')
        return {}


def upsert_rt_score(amc_id, title, rt_score, rt_slug, now_str):
    try:
        sb.upsert('movie_scores', [{
            'amc_id': amc_id,
            'title': title,
            'rt_score': rt_score,
            'rt_slug': rt_slug or None,
            'fetched_at': now_str,
        }], on_conflict='amc_id')
    except sb.SupabaseError as e:
        print(f'Warning: upsert for "{title}" failed: {e}')


def cleanup_rt_cache(amc_ids):
    if not amc_ids:
        return
    try:
        id_list = ','.join(str(i) for i in amc_ids)
        sb.delete('movie_scores', {'amc_id': f'not.in.({id_list})'})
    except sb.SupabaseError as e:
        print(f'Warning: cleanup failed: {e}')
