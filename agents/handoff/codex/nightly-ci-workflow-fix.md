# Handoff: codex/nightly-ci-workflow-fix

## Summary
- Fixed the scheduled CI workflow so nightly E2E runs use `xvfb` with headed Chromium instead of forcing headless mode.
- Stabilized the extension-backed Playwright specs with a shared helper that waits longer for the MV3 service worker to register.
- Verified the failing local `annotates_cards` spec and the full E2E suite now pass in the same headed mode the nightly job will use.

## Key files
- `.github/workflows/ci.yml`
- `tests/e2e/extension_worker.ts`
- `tests/e2e/annotates_cards.spec.ts`
- `tests/e2e/page_score_jobposting.spec.ts`
- `tests/e2e/search_page.spec.ts`

## How to verify
- `npm run build`
- `PLAYWRIGHT_HEADLESS=0 npm run test:e2e`
- `npm run lint`
- `npm test`
- Re-run the scheduled CI workflow and confirm the nightly E2E step no longer times out waiting for the extension service worker.

## Behavior changes
- Nightly GitHub Actions E2E now runs in an extension-capable headed browser session under `xvfb`.
- Extension E2E specs tolerate slower service worker startup by waiting up to 15 seconds for registration.

## Risks / edge cases
- Nightly runs remain dependent on extension service worker startup; this change improves tolerance but does not mask real worker crashes.
- The nightly job now uses headed Chromium under `xvfb`, so runner resource usage is slightly higher than pure headless mode.

## Follow-ups
- If nightly CI still flakes after this change, capture the next failed run’s job log and consider reducing Playwright worker count for extension-backed specs specifically.
