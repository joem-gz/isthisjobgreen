# Task: Keep the location index in the extension service worker
Owner agent/tool: Codex (continued locally after delegated agent capacity was exhausted)
Branch: agent/location-index-architecture

## Scope
Will change: extension scoring/message boundaries, build entry points, regression tests, and a deterministic bundle-size budget.
Won’t change: server/widget copies of the location data, scoring semantics, Reed parsing, page-score UI, search sorting, dependencies, or unrelated module structure.

## Files likely touched
- `src/messages.ts`, `src/service_worker.ts`, `src/content_script.ts`, `src/features/page_score/index.ts`, `src/pages/search/search.ts`
- `src/geo/place_resolver.ts` and focused tests as needed
- `scripts/build.mjs` and/or a small budget check script
- task/handoff artifacts

## Success criteria
- Only the service-worker extension bundle contains the large location index.
- Content-page and extension-search bundles request scoring through typed service-worker messages.
- Existing location resolution and scoring behavior remains unchanged.
- A deterministic check fails if the index returns to content/search bundles or exceeds the agreed budget.

## Plan (short)
- Trace current scoring imports and build entry points.
- Add the smallest typed request/response boundary and move index ownership to the worker.
- Add regression tests and bundle budget measurement.
- Run lint, tests, builds, typecheck status, and focused E2E where available.

## Validation (commands)
- `npm run lint` — passed
- focused message/runtime/page/search/scan tests — passed: 5 files, 17 tests
- `npm run typecheck` — passed after rebasing onto merged PRs #18 and #19
- `npm test` — passed: 36 files, 146 tests
- `npm run build` — passed with index-ownership and bundle-budget checks
- `npm run check:extension-package` — passed: 6 required files verified
- `npm run build:widget` — passed
- `npm run server:build` — passed
- `npm run test:e2e -- tests/e2e/annotates_cards.spec.ts` — passed with the cached Playwright Chromium path
- `git diff --check` — passed

## Risks / edge cases
- Preserve asynchronous message handling and extension contexts.
- Do not make the large index remotely hosted; MV3 must keep all executable code local.
- Keep server/widget standalone bundles unchanged in this slice.

## Decisions / notes
- This is intentionally a bounded extension-only improvement. A future slice may compact/lazy-load the worker index and separately address server/widget duplication.
- Baseline bundles: content script 7,463,034 bytes; search page 7,394,340; service worker 7,378,758.
- New bundles: content script 89,146 bytes; search page 22,688; service worker 7,382,790.
- After rebasing onto `main` at `a19f40c`, the budgets remain green: content script 89,175 bytes; search page 22,454; service worker 7,382,788.
