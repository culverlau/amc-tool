"""Cloudflare-bypass Playwright launch config shared by every scraper in this
repo. Single-sourced so the tuning (user agent, anti-automation flag) never
drifts between scripts."""

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
)


def launch_browser_context(playwright):
    """One browser + context with the shared Cloudflare-bypass tuning.
    Caller owns lifecycle (close both when done)."""
    browser = playwright.chromium.launch(
        headless=True,
        args=['--disable-blink-features=AutomationControlled'],
    )
    context = browser.new_context(user_agent=USER_AGENT)
    return browser, context
