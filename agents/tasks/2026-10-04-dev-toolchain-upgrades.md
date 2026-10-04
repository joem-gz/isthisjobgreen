# Task: Remediate vulnerable development tooling

Owner agent/tool: Codex
Branch: agent/dev-toolchain-upgrades

## Scope
Will change: remove unused Vitest UI, apply compatible security updates to development tooling, refresh the lockfile, and document residual advisories.
Won’t change: SheetJS/data-pipeline replacement, runtime application behavior, or unrelated dependency majors.

## Files likely touched
- `package.json`
- `package-lock.json`
- focused CI or documentation only if needed

## Success criteria
- Unused `@vitest/ui` is removed.
- Vitest is upgraded to the patched `4.1.11` release.
- Compatible dependency fixes are applied without force or major-version upgrades.
- Runtime audit remains clean and residual development advisories are explicitly triaged.
- Lint, typecheck status, tests, builds, and E2E smoke are validated as applicable.

## Plan (short)
- Capture baseline dependency usage and audit results.
- Remove unused tooling and run non-breaking audit remediation.
- Inspect the resulting dependency graph and advisories.
- Run broad validation and publish a small draft PR.

## Validation (commands)
- `npm audit --json`
- `npm audit --omit=dev --json`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run build:widget`
- `npm run server:build`
- `npx tsc --noEmit` status
- `git diff --check`

## Risks / edge cases
- Audit severity does not equal application exploitability; all reviewed packages are development/build dependencies.
- SheetJS has no safe in-line npm fix and remains a separate data-pipeline isolation/replacement PR.

## Decisions / notes
- Do not use `npm audit fix --force` or introduce major versions without a separate review.
- Removed `@vitest/ui`: the repository does not expose a UI test script or configuration, so retaining its server-side surface had no benefit.
- Upgraded Vitest from `4.0.17` to `4.1.11`, the patched release for the reviewed Vitest advisories.
- Refreshed packages only within their declared compatible ranges. This moved the live audit from 10 findings (4 moderate, 6 high) to 3 findings (1 low, 1 moderate, 1 high).
- Residual findings need separate, reviewable decisions:
  - `esbuild` requires a `0.27` to `0.28` upgrade and is low severity.
  - `csv-parse` requires a `6` to `7` major upgrade and is moderate severity.
  - npm has no patched `xlsx` release; replacement or isolation is the high-priority follow-up.
- Validation completed:
  - clean `npm ci --ignore-scripts` in `/private/tmp/gsc-toolchain-ci2.Ka32od`
  - `npm run lint` passed
  - `npm test` passed (34 files, 133 tests) on Vitest `4.1.11`
  - extension, widget, and server builds passed
  - `npm audit --omit=dev --json` reported zero runtime findings
  - `git diff --check` passed
- `npx tsc --noEmit` still reports the pre-existing 35 errors fixed by parallel PR #18; this branch introduces no source-file diagnostics and should be rebased after #18 merges.
- The repository-prescribed `./scripts/codex/check-agent-artifacts.sh` helper is absent. Artifact verification was completed manually: branch scope, task note, handoff note, changed-file list, and `git diff --check` all passed review.
