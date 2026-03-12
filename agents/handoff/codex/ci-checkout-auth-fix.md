# Handoff: codex/ci-checkout-auth-fix

## Summary
- Updated the CI workflow to use `actions/checkout@v6` instead of `actions/checkout@v4`.
- The failing scheduled run on March 12, 2026 (`22987172731`) died inside checkout before any repo code executed, so this branch targets the checkout/auth layer only.
- Local validation confirmed the workflow YAML still parses, and branch push run `22997351755` completed successfully with `Run actions/checkout@v6` and the rest of the CI job passing.

## Key files
- `.github/workflows/ci.yml`
- `agents/tasks/2026-03-12-ci-checkout-auth.md`

## How to verify
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml")'`
- Confirm push run `22997351755` passed on `codex/ci-checkout-auth-fix`, including `Run actions/checkout@v6`.
- If needed, rerun the next scheduled `CI` run on `main` after merge and confirm checkout no longer fails with the GitHub username prompt error.

## Behavior changes
- CI now uses the current `actions/checkout` major instead of the older `v4` line.

## Risks / edge cases
- This patch is intentionally narrow; if the scheduled failure was caused by a transient GitHub platform issue rather than checkout v4, the next scheduled run could still fail and would need fresh logs.
- `actions/setup-node@v4` and `actions/cache@v4` are still on older majors and may need a separate update before the June 2, 2026 Node 20 deprecation cutoff.

## Follow-ups
- If branch CI or the next scheduled run still fails in checkout, replace `actions/checkout` with an explicit token-authenticated manual `git fetch` step and capture the new runner log.
