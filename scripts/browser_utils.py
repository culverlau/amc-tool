"""Cloudflare-bypass Playwright launch config shared by every scraper in this
repo. Single-sourced so the tuning (user agent, anti-automation flag) never
drifts between scripts."""

def launch_browser_context(playwright):
    """One browser + context with the shared Cloudflare-bypass tuning.
    Caller owns lifecycle (close both when done)."""
    # Cloudflare now challenges headless mode and bundled Chromium (403 "Just a
    # moment..."); only installed Chrome running headed gets through. In CI the
    # workflows wrap the script in `xvfb-run` to supply a virtual display.
    browser = playwright.chromium.launch(
        channel='chrome',
        headless=False,
        args=['--disable-blink-features=AutomationControlled'],
    )
    context = browser.new_context()
    return browser, context
