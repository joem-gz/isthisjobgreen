# Handoff: agent/typecheck-ci-gate

## Summary
- Restored a clean strict TypeScript check without suppressions or weaker compiler settings.
- Added explicit CSS asset typing and `DOM.Iterable`, narrowed optional values and required DOM elements, corrected the score-error discriminant, and replaced inaccurate Chrome test mocks.
- Added required CI gates for typecheck, widget build, server build, and extension package integrity.

## Key files
- `tsconfig.json`
- `src/types/assets.d.ts`
- `src/pages/search/search.ts`
- `src/popup/popup.ts`
- `src/service_worker.ts`
- `scripts/check_extension_package.mjs`
- `package.json`
- `.github/workflows/ci.yml`

## How to verify
- `npm run typecheck` — expect zero diagnostics.
- `npm run lint` — expect success.
- `npm test` — expect 34 files and 133 tests to pass.
- `npm run build`
- `npm run check:extension-package` — expect six required package files to be verified.
- `npm run build:widget`
- `npm run server:build`
- `git diff --check`

## Behavior changes
- A failed service-worker scoring operation now returns the supported `error` state instead of the invalid `unknown` state.
- Missing required popup/search DOM elements still fail fast, now naming the missing selector.
- CI now rejects type errors or missing extension, widget, or server artifacts.

## Risks / edge cases
- The extension package check verifies required entry artifacts, not Chrome Web Store installation or signing.
- No dependency versions or TypeScript strictness settings changed.

## Follow-ups
- Keep the new typecheck and shipped-surface build gates required as later Wave 2 branches are rebased.
- The repository-prescribed `./scripts/codex/check-agent-artifacts.sh` is absent, so artifacts were manually verified against `AGENTS.md` and `agents/playbooks.md`.
