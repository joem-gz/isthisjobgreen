# Task: Extension least-privilege hardening
Owner agent/tool: Codex
Branch: agent/extension-least-privilege

## Scope
Will change:
- Restrict the content script and manifest host permissions to supported Reed pages and required API endpoints.
- Replace the arbitrary-URL service-worker fetch broker with typed employer endpoint messages.
- Validate extension message shape and service-worker sender identity.
- Add focused unit/build coverage and document compatibility impact.

Won't change:
- The location index architecture or bundle layout.
- Provider/server authentication or upstream client behavior.
- Search/employer user-facing behavior.

## Files likely touched
- `src/manifest.json`
- `src/messages.ts`
- `src/service_worker.ts`
- `src/employer/api.ts`
- focused unit/build tests and documentation as needed

## Success criteria
- Content scripts only match supported Reed HTTPS jobs pages.
- Production host permissions contain no wildcard HTTP(S) hosts.
- Employer runtime requests use typed endpoint-specific messages with bounded validation.
- Messages from outside the extension are rejected.
- Lint, tests, extension build, and focused E2E validation pass.

## Plan (short)
- Inspect all current runtime message and API call paths.
- Narrow manifest and add message type guards.
- Update worker and employer client while preserving local proxy behavior.
- Add tests for message validation/worker-facing contracts and build output.
- Run validation, write handoff, commit, push, and open a draft PR.

## Validation (commands)
- `npm run lint` — passed.
- `npm test` — passed: 31 files, 112 tests.
- `npm run build` — passed.
- Follow-up score-message validation — passed: valid settings are accepted while missing, invalid-enum, oversized-postcode, fractional, non-finite, and out-of-range office-day settings are rejected.
- `npm run test:e2e -- tests/e2e/annotates_cards.spec.ts` — blocked before test execution because the local Playwright Chromium binary is not installed.
- `npx tsc --noEmit` — still reports the repository's pre-existing diagnostics; no new diagnostics were introduced by this slice.
- `git diff --check` — passed.

## Risks / edge cases
- The employer runtime path currently targets the local proxy; keep that path fixed and do not introduce a new configurable destination in the broker.
- Search-page direct fetch remains a local-proxy call and therefore needs the explicit localhost host permission.
- Existing test doubles may model `chrome.runtime` incompletely; keep validation helpers independently testable.

## Decisions / notes
- The supported production site is `https://www.reed.co.uk/jobs*` per README and plans.
- Development localhost access remains explicit as `http://localhost:8787/*`; no wildcard host permission is retained.
- The service worker now owns only the fixed local employer endpoints; it does not accept caller-supplied URLs.
- Message sender validation requires the current extension runtime ID, which prevents page/foreign-extension callers from reaching the worker handlers.
