# wx-instagram

Minimal static single‑page app that generates Instagram-ready captions, alt text, and image suggestions from National Weather Service (NWS) forecasts. Enter a US ZIP code or a latitude,longitude pair and the app will fetch NWS forecast data, aggregate a multi-day outlook, and help produce captions and an overlay SVG suitable for social posts.

## Features
- Accepts US ZIP (e.g. `02139`) or `lat,lon` (e.g. `42.36,-71.06`).
- Calls Zippopotam.us (for ZIP → lat/lon) and api.weather.gov for forecast and alerts.
- Aggregates forecast periods into daily high/low and brief text summaries.
- Builds:
  - Short caption for Instagram
  - Longer multi-day "weather outlook" caption (includes active alerts)
  - Alt text for images
  - Image concept suggestions
- Generates a prefilled SVG overlay for quick post creation.
- Caches recent API results in browser localStorage (10 minute TTL).

## Quick usage
1. Open `index.html` in a browser (or host on GitHub Pages).
2. Enter a US ZIP or `lat,lon` in the input and choose the number of days (e.g. 5).
3. Click "Generate".
4. Use the copy buttons to copy short caption, long caption, alt text, or image suggestions. Click the SVG download to get a ready-made overlay.

Note: This is a static client-side app — no server is required to run the UI.

## Example output
- Short caption: emoji + temps + short summary + a few hashtags.
- Long caption: `<Place> — 5-day weather outlook` followed by daily lines, short summary, and active alerts (if any).
- Alt text: concise descriptive text for accessibility.
- Image suggestions: photo concepts and palette suggestions for social images.

## Important operational notes & caveats
- Rate limiting and headers:
  - api.weather.gov expects responsible use and may rate-limit or prefer requests that include contact information in the `User-Agent`. Browser clients cannot set User-Agent headers; if you plan wider public usage consider adding a small serverless proxy (Vercel/Netlify) to centralize requests, set an appropriate `User-Agent`, and add caching.
- API shapes vary:
  - Some NWS "product" endpoints return plain text rather than JSON; the app attempts defensive parsing but may not always extract HWO product text. Expect occasional edge cases.
- Privacy:
  - The app sends lat/lon values to public APIs. Do not send other private information.

## Troubleshooting
- If "No forecast for location" appears, the location may be outside coverage or the NWS endpoint returned unexpected data.
- If you see frequent 429 / 403 responses from api.weather.gov, add a server-side proxy to reduce client-side direct traffic.
- If copy operations fail, check browser clipboard permissions; copy buttons use the Clipboard API.

## Development
This is a single file JS app (core logic in `caption.js`, UI in `index.html`, styling in `style.css`).

To iterate locally:
- Edit `caption.js`, `index.html`, or `style.css`.
- Open `index.html` in your browser to test.

Recommended dev additions (low-effort improvements)
- Add ESLint + Prettier and a GitHub Actions workflow to lint on PRs.
- Add a small test harness (Jest) for `aggregateDays()` and caption builders.
- Add an inline status/notification area to replace `alert()` calls and improve accessibility.
- Add serverless proxy for api.weather.gov requests (handles contact headers + caching).

## Contributing
Contributions welcome. Suggestions:
- Improve robust parsing of NWS product endpoints (handle plain text).
- Add unit tests for aggregation and caption generation.
- Add an accessibility review and fix (aria-live regions, labels, keyboard focus).

When submitting PRs:
- Keep changes small and focused.
- Run linting (if added) and include tests for any logic changes.

## What I changed recently
- Fixed a runtime bug in `caption.js` where an invalid literal broke aggregation (replaced the invalid `raw: [...]` with a proper shallow copy of the day's items).
- Updated the long caption heading to use "X-day weather outlook" instead of "snapshot".
