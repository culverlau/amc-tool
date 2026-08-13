// Lets an authenticated client trigger an on-demand showtime fetch for a
// single theater (e.g. right after following it) instead of waiting for the
// 6-hour cron. Supabase verifies the caller's JWT before this ever runs
// (no --no-verify-jwt), so only signed-in users can reach it. The GitHub PAT
// this needs (repo-scoped, Actions: Read and write) lives only in this
// function's secrets — never in web/ or app/.

const GITHUB_TOKEN = Deno.env.get("GITHUB_PAT")
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "culverlau/amc-tool"

// The browser sends a CORS preflight OPTIONS request before the real POST
// because it carries Authorization/Content-Type headers cross-origin.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: CORS_HEADERS,
    })
  }

  const amcId = Number((body as { amc_id?: unknown })?.amc_id)
  if (!Number.isInteger(amcId) || amcId <= 0) {
    return new Response(JSON.stringify({ error: "amc_id must be a positive integer" }), {
      status: 400,
      headers: CORS_HEADERS,
    })
  }

  if (!GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: "server misconfigured: missing GITHUB_PAT" }), {
      status: 500,
      headers: CORS_HEADERS,
    })
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/fetch-showtimes.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main", inputs: { theater_ids: String(amcId) } }),
    },
  )

  if (!res.ok) {
    const text = await res.text()
    return new Response(
      JSON.stringify({ error: `GitHub dispatch failed: ${res.status} ${text}` }),
      { status: 502, headers: CORS_HEADERS },
    )
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 202,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  })
})
