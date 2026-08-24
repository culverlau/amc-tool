"""Minimal Supabase REST helper for the GitHub Actions jobs.

Talks to PostgREST and Storage with plain `requests` rather than pulling in the
supabase-py SDK — these jobs need six calls between them and already depend on
requests.

Uses the SERVICE ROLE key, which bypasses RLS entirely. It must only ever live
in GitHub Actions secrets or a local .env; never in web/, app/, or a commit.
"""

import json
import os

import requests

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""

TIMEOUT = 30


class SupabaseError(RuntimeError):
    pass


def _require_config():
    if not SUPABASE_URL or not SERVICE_KEY:
        raise SupabaseError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set "
            "(GitHub Actions secrets, or a local .env for manual runs)"
        )


def _headers(extra=None):
    h = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _check(resp, what):
    if resp.status_code >= 300:
        raise SupabaseError(f"{what} failed: HTTP {resp.status_code} {resp.text[:400]}")
    return resp


def select(table, params=None):
    """GET rows. `params` maps to PostgREST filters, e.g. {'select': '*', 'id': 'eq.3'}."""
    _require_config()
    p = {"select": "*"}
    p.update(params or {})
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}", headers=_headers(), params=p, timeout=TIMEOUT
    )
    _check(r, f"select {table}")
    return r.json()


def select_all(table, params=None, page_size=1000):
    """GET every row, paging past PostgREST's default row cap."""
    out = []
    offset = 0
    while True:
        r = select(
            table,
            {**(params or {}), "limit": str(page_size), "offset": str(offset)},
        )
        out.extend(r)
        if len(r) < page_size:
            return out
        offset += page_size


def upsert(table, rows, on_conflict=None):
    """Insert or update. `on_conflict` names the conflict target column(s)."""
    _require_config()
    if not rows:
        return []
    params = {}
    if on_conflict:
        params["on_conflict"] = on_conflict
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=_headers(
            {"Prefer": "resolution=merge-duplicates,return=representation"}
        ),
        params=params,
        data=json.dumps(rows),
        timeout=TIMEOUT,
    )
    _check(r, f"upsert {table}")
    return r.json() if r.text else []


def update(table, params, values):
    """PATCH matching rows with `values`. `params` must be non-empty — PostgREST
    would otherwise happily overwrite the whole table."""
    _require_config()
    if not params:
        raise SupabaseError("update requires a filter")
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=_headers({"Prefer": "return=minimal"}),
        params=params,
        data=json.dumps(values),
        timeout=TIMEOUT,
    )
    _check(r, f"update {table}")


def delete(table, params):
    """DELETE matching rows. `params` must be non-empty — PostgREST would
    otherwise happily delete the whole table."""
    _require_config()
    if not params:
        raise SupabaseError("delete requires a filter")
    r = requests.delete(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=_headers({"Prefer": "return=minimal"}),
        params=params,
        timeout=TIMEOUT,
    )
    _check(r, f"delete {table}")


def storage_upload(bucket, path, data, content_type="application/json"):
    """Upload (overwriting) an object into a Storage bucket."""
    _require_config()
    if isinstance(data, str):
        data = data.encode("utf-8")
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path}",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        data=data,
        timeout=TIMEOUT * 2,
    )
    _check(r, f"storage upload {bucket}/{path}")


def storage_download(bucket, path):
    """GET an object from a Storage bucket. Raises SupabaseError on a
    non-2xx (e.g. 404 for a theater that hasn't been fetched yet) — callers
    should catch and treat that as "no data yet", not a hard failure."""
    _require_config()
    r = requests.get(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path}",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
        timeout=TIMEOUT * 2,
    )
    _check(r, f"storage download {bucket}/{path}")
    return r.json()
