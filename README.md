```markdown
# wx-instagram

Minimal static single-page app that generates Instagram-ready captions, alt text and image suggestions from NWS forecasts.
It accepts a US ZIP or lat,lon, calls NWS/APIs, aggregates a multi-day outlook, and helps produce captions & an SVG overlay.

Quick usage
- Open index.html in a browser (or host on GitHub Pages).
- Enter a 5-digit US ZIP (or "lat,lon") and choose days (e.g. 5). Click Generate.

Notes & caveats
- The app calls public APIs (Zippopotam.us and api.weather.gov) from the browser. api.weather.gov may rate-limit client-side traffic or expect contact headers — if you see 429/403 errors frequently consider adding a small serverless proxy that sets an appropriate User-Agent and centralizes caching.
- ZIP format: 5 digits or ZIP+4 (e.g. 02139 or 02139-1234).

Development
- This is a static JS/HTML/CSS project. To test edits locally:
  - Edit files (index.html, caption.js, style.css)
  - Open index.html in your browser

Suggested next files to add
- .eslintrc.json / .prettierrc for consistent style
- A GitHub Actions workflow to run lint/tests on PRs
- A LICENSE (MIT) and CONTRIBUTING.md if you want community contributions

What I changed
- Fixed a runtime bug in caption.js (aggregateDays previously had an invalid raw literal).
- Changed the long caption header to show "X-day weather outlook".

Want me to add any of these now?
- I can: add ESLint + Prettier and a CI workflow, create a small Jest test for aggregateDays, or implement the inline status UI (error/messages) — tell me which and I’ll prepare the files and push them.
```
