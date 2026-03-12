# Task: Fix scheduled CI checkout auth failure
Owner agent/tool: Codex
Branch: codex/ci-checkout-auth-fix

## Scope
Will change:
- Investigate the scheduled CI failure that occurs during repository checkout on GitHub Actions.
- Apply the smallest workflow change that addresses the failing checkout/auth path.
- Add the required handoff note for this branch.

Won't change:
- Repo application code or tests unless required to validate the workflow change.
- Unrelated workflow refactors or dependency upgrades outside the failing checkout path.

## Files likely touched
- `.github/workflows/ci.yml`
- `agents/handoff/codex/ci-checkout-auth-fix.md`

## Success criteria
- Identify the failing Actions run and the exact checkout error.
- Implement a targeted workflow fix.
- Validate the workflow change as far as local tooling and GitHub checks allow.
- Commit, push, and open a draft PR.

## Plan (short)
- Inspect the failing scheduled run and compare it with the successful push run on the same commit.
- Patch the workflow with the smallest safe checkout/auth change.
- Run local workflow validation where possible and rely on branch CI for end-to-end checkout verification.
- Document findings and open the PR.

## Validation (commands)
- `gh run view 22987172731 --json jobs`
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml")'`
- Branch CI on `codex/ci-checkout-auth-fix` after push

## Risks / edge cases
- This failure happens inside GitHub-hosted checkout logic, so local reproduction is limited.
- Other workflow actions remain on older majors and may need a separate update before the June 2, 2026 Node 20 deprecation deadline.

## Decisions / notes
- Repo guidance prefers `agent/<topic>-<short-desc>` branches, but Codex session policy requires the `codex/` prefix. Using `codex/ci-checkout-auth-fix`.
- Scheduled run `22987172731` on March 12, 2026 failed in `actions/checkout@v4` before repository code ran; the log showed checkout successfully writing `http.https://github.com/.extraheader` and then failing `git fetch` with `fatal: could not read Username for 'https://github.com': terminal prompts disabled`.
- Push run `22970166905` on the same merge commit `67f771f4f6512ef1fa5f1871d7201570e151cbc3` completed successfully, so this points to a checkout/auth path issue specific to the older checkout implementation rather than application code.
- Official current `actions/checkout` release is `v6.0.2` (published January 9, 2026). Upgrading only checkout is the smallest targeted workflow change for this failure.
- Branch push run `22997351755` on `codex/ci-checkout-auth-fix` completed successfully on March 12, 2026, including `Run actions/checkout@v6` and the remainder of the CI job.
