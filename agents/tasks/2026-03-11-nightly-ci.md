# Task: Fix nightly CI workflow failure
Owner agent/tool: Codex
Branch: codex/nightly-ci-workflow-fix

## Scope
Will change:
- Investigate the failing nightly GitHub Actions workflow and patch the smallest workflow or test issue causing the failure.
- Add or update validation needed to protect the changed behavior.
- Add a handoff note for this branch.

Won't change:
- Unrelated CI jobs or non-nightly workflows unless they are directly required for the fix.
- Repository-wide refactors, dependency changes, or unrelated test cleanup.

## Files likely touched
- `.github/workflows/ci.yml`
- `tests/**`
- `agents/handoff/codex/nightly-ci-workflow-fix.md`

## Success criteria
- Identify the current nightly workflow failure from GitHub Actions logs.
- Implement the smallest local fix that addresses the failure.
- Run the smallest reliable local validation relevant to the fix.
- Commit, push, and open a draft PR.

## Plan (short)
- Inspect the failing scheduled workflow and capture the actionable error.
- Trace the failure to the relevant workflow step or test code.
- Implement a targeted fix and verify locally.
- Write handoff notes, then commit/push/PR.

## Validation (commands)
- `gh run view <run-id> --log`
- `npm run build`
- `PLAYWRIGHT_HEADLESS=0 npm run test:e2e`
- `npm run lint`
- `npm test`

## Risks / edge cases
- Nightly runs may differ from local runs because they execute under GitHub-hosted runners and schedule-triggered conditions.
- Prior CI fixes in this area may have shifted the failure to a different step.

## Decisions / notes
- Repo guidance prefers `agent/<topic>-<short-desc>` branches, but Codex session policy requires the `codex/` prefix. Using `codex/nightly-ci-workflow-fix` to satisfy the higher-priority branch rule.
- GitHub Actions scheduled run `22937279176` on March 11, 2026 failed in `E2E nightly (headless)` because extension-backed Playwright specs timed out waiting for the MV3 service worker.
- Updated the nightly workflow to run under `xvfb` with `PLAYWRIGHT_HEADLESS=0`, matching the extension-capable browser mode already used by the smoke test.
- Added a shared E2E helper to allow up to 15 seconds for extension service worker startup after local full-suite runs showed `tests/e2e/annotates_cards.spec.ts` could flake under parallel load with a 5-second timeout.
- Local results: `npm run build` passed; `PLAYWRIGHT_HEADLESS=0 npm run test:e2e` passed with 6/6 specs; `npm run lint` passed; `npm test` passed with 28 files / 92 tests.
