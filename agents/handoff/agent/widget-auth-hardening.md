# Handoff: agent/widget-auth-hardening

## Summary

- Stacked on `agent/security-tech-debt-review` / PR #13.
- Removes browser-embedded central API keys from the widget integration.
- Requires browser widgets to call a same-origin partner endpoint.
- Restricts the central widget endpoint to originless, API-key-authenticated server calls.
- Adds 32 KiB request limits, JSON content-type checks, strict runtime request validation, generic top-level error handling, constant-time key comparison, job URL origin checks, and complete cache keys.

## Key files

- `widget/src/index.ts`
- `server/widget_service.ts`
- `server/request_body.ts`
- `server/index.ts`
- `docs/widget/partner-guide.md`
- `server/README.md`
- `tests/unit/widget_api.test.ts`
- `tests/unit/request_body.test.ts`

## How to verify

- `npm run lint` — passes.
- `npm test` — 29 files and 108 tests pass.
- `npm run build` — passes.
- `npm run build:widget` — passes.
- `npm run server:build` — passes.
- `npm run test:e2e -- tests/e2e/widget_ssr.spec.ts tests/e2e/widget_jsonld.spec.ts tests/e2e/widget_jobcards.spec.ts` — 3 tests pass.
- `npx tsc --noEmit` — retains 35 pre-existing diagnostics outside this slice and reports no new errors in changed files.
- Local built-server smoke on port 8899 — valid originless request 200; request with `Origin` 403; `null` body 400; declared 40,000-byte body 413.

## Behavior changes

- `WidgetInitOptions.apiKey` is removed; the widget no longer sends `X-API-Key` from the browser.
- On HTTP(S) pages, `apiBaseUrl` must resolve to the page's origin.
- The central `/api/widget/score` rejects every request containing an `Origin` header and rejects browser preflights.
- Central callers must send `Content-Type: application/json`, use a server-side partner key, stay below 32 KiB, and send a validated request shape.
- A configured partner's `origins` now restricts request `jobUrl` origins.

## Risks / edge cases

- Existing direct browser integrations must migrate to a same-origin partner endpoint and rotate any key previously exposed to browsers.
- Server-to-server integrations that incorrectly forward the browser `Origin` header will receive 403 until they stop forwarding it.
- The separate jobs/employer proxy routes remain outside this change and retain their existing CORS/deployment posture.

## Follow-ups

- Decide whether direct browser-to-central calls are still a product requirement; if so, design a vetted delegated-token service rather than restoring static browser keys.
- Address remaining P0/P1 review findings in separate stacked branches.
