# Handoff: agent/dev-toolchain-upgrades

## Summary
- Remove the unused `@vitest/ui` package.
- Upgrade Vitest from `4.0.17` to patched `4.1.11`.
- Refresh dependencies within their existing version ranges, reducing the live npm audit from 10 findings to 3.

## Key files
- `package.json`
- `package-lock.json`
- `agents/tasks/2026-10-04-dev-toolchain-upgrades.md`

## How to verify
Run:

```bash
npm ci --ignore-scripts
npm run lint
npm test
npm run build
npm run build:widget
npm run server:build
npm audit --omit=dev
npm audit
git diff --check origin/main...HEAD
```

Expected results:
- lint, 34 test files / 133 tests, and all three builds pass;
- the runtime-only audit reports zero findings;
- the full audit reports three explicitly deferred findings: low `esbuild`, moderate `csv-parse`, and high `xlsx`.

## Behavior changes
- No application runtime behavior changes.
- Test execution uses Vitest `4.1.11`; its config-loader migration warning is informational and should be handled separately.

## Risks / edge cases
- The lockfile diff is broad because the compatible refresh advances all packages already permitted by the existing ranges.
- `npx tsc --noEmit` reports the existing 35 diagnostics addressed by parallel PR #18. Rebase this PR after #18 before merge and rerun typecheck.

## Follow-ups
- Replace or isolate `xlsx`; npm provides no patched release for its prototype-pollution and ReDoS advisories.
- Evaluate the `csv-parse` 7.x and `esbuild` 0.28 upgrades in separate compatibility-focused PRs.
