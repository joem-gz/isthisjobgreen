# Handoff: codex/ci-checkout-auth-fix

## Summary
- Updated the CI workflow to use `actions/checkout@v6` instead of `actions/checkout@v4`.
- The failing scheduled run on March 12, 2026 (`22987172731`) died inside checkout before any repo code executed, so this branch targets the checkout/auth layer only.
- Local validation confirmed the workflow YAML still parses; branch CI should be used as the end-to-end verification because the failure happens on GitHub-hosted runners during checkout.

## Key files
- `.github/workflows/ci.yml`
- `agents/tasks/2026-03-12-ci-checkout-auth.md`

## How to verify
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml")'`
- Push the branch and confirm the `CI` workflow gets past `Run actions/checkout@v6`.
- If needed, rerun the next scheduled `CI` run on `main` after merge and confirm checkout no longer fails with the GitHub username prompt error.

## Behavior changes
- CI now uses the current `actions/checkout` major instead of the older `v4` line.

## Risks / edge cases
- This patch is intentionally narrow; if the scheduled failure was caused by a transient GitHub platform issue rather than checkout v4, the next scheduled run could still fail and would need fresh logs.
- `actions/setup-node@v4` and `actions/cache@v4` are still on older majors and may need a separate update before the June 2, 2026 Node 20 deprecation cutoff.

## Follow-ups
- If branch CI or the next scheduled run still fails in checkout, replace `actions/checkout` with an explicit token-authenticated manual `git fetch` step and capture the new runner log.
