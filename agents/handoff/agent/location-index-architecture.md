# Handoff: agent/location-index-architecture

## Summary
- Made the service worker the sole extension owner of the 6.9 MB UK location index.
- Routed page-score and extension-search scoring through typed runtime messages while preserving existing scoring functions in the worker.
- Added bounded runtime message validation and client response correlation.
- Added build-time input ownership and byte budgets so content/search bundles cannot silently regain the index.

## Key files
- `src/scoring/runtime.ts`
- `src/messages.ts`
- `src/service_worker.ts`
- `src/features/page_score/index.ts`
- `src/pages/search/search.ts`
- `scripts/build.mjs`
- `tests/unit/runtime_scoring.test.ts`
- `tests/unit/messages.test.ts`

## How to verify
- `npm run lint`
- `npm run typecheck`
- `npm test` — expect 36 files and 146 tests to pass.
- `npm run build` — expect the build to report content/search/popup without the index and the service worker with it.
- `npm run check:extension-package` — expect 6 required files to be verified.
- `npm run build:widget`
- `npm run server:build`
- `PLAYWRIGHT_BROWSERS_PATH=<installed-browser-cache> npm run test:e2e -- tests/e2e/annotates_cards.spec.ts`
- `git diff --check`

## Behavior changes
- Content-page and extension-search scoring now cross the existing trusted extension runtime boundary instead of resolving the location index independently.
- Content script size falls from 7,463,034 to 89,146 bytes (98.8% reduction).
- Search page size falls from 7,394,340 to 22,688 bytes (99.7% reduction).
- The service-worker bundle remains approximately 7.4 MB because it owns local location resolution.

## Risks / edge cases
- Runtime search batches are capped at 250 jobs and validate field/coordinate bounds before scoring.
- Saved-job extra fields survive structured cloning but are not used by scoring.
- The focused browser E2E passed after pointing Playwright at the installed Chromium cache; the first sandboxed launch was blocked by macOS crash-handler permissions and succeeded outside the sandbox.
- Server and standalone widget bundles retain their own necessary index copy in this bounded slice.

## Follow-ups
- Rebased onto merged PRs #18 and #19; typecheck, package checks, and the focused E2E all pass.
- A later slice can compact or lazily load the worker index and separately redesign standalone widget/server location lookup.
- The repository-prescribed artifact script is absent, so artifacts were manually verified against `AGENTS.md` and `agents/playbooks.md`.
