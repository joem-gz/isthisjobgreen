# Handoff: agent/extension-least-privilege

## Summary
- Restricted content-script injection to `https://www.reed.co.uk/jobs*`.
- Replaced wildcard HTTP(S) host permissions with the exact Postcodes.io API and local proxy origins used by the extension.
- Replaced the arbitrary-URL `fetch_json_request` broker with typed employer resolve/signals messages that always target the fixed local proxy endpoints.
- Added bounded message shape validation and required the current extension runtime sender ID before handling messages.
- Added manifest and message-validation unit coverage; existing employer runtime tests now assert the typed contract.

## Key files
- `src/manifest.json`
- `src/messages.ts`
- `src/service_worker.ts`
- `src/employer/api.ts`
- `tests/unit/messages.test.ts`
- `tests/unit/manifest.test.ts`
- `tests/unit/employer_api.test.ts`

## How to verify
Passed:
- `npm run lint`
- `npm test` — 31 files, 112 tests
- `npm run build`
- `git diff --check`
- Follow-up score-message tests cover valid settings and malformed/unsafe settings fields.

Blocked:
- `npm run test:e2e -- tests/e2e/annotates_cards.spec.ts` — Playwright could not launch because the local Chromium binary is not installed in this worktree environment.
- `npx tsc --noEmit` remains blocked by pre-existing repository diagnostics; no changed-file-specific new diagnostic was identified.

## Behavior changes
- The extension no longer runs its content script on unrelated HTTP(S) pages.
- Employer requests from the extension runtime still use the local proxy, but the worker constructs the endpoint and query from typed fields rather than accepting arbitrary URLs.
- External/custom employer base URLs passed to API helpers continue to use direct `fetch`; only the default local proxy uses runtime messaging.

## Risks / edge cases
- The extension's current search/employer architecture depends on the local proxy, so `http://localhost:8787/*` remains an explicit host permission rather than a separate production/development manifest.
- If a future deployment changes the employer proxy origin, the typed worker endpoint and manifest permission must be updated together.

## Follow-ups
- Install the repository's Playwright browser and rerun the focused Reed extension E2E.
- The large location index remains intentionally unchanged for the dependent TD-02 architecture PR.
