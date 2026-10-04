# Task: Typecheck and CI build gates

Owner agent/tool: Codex (continued locally after the delegated agent hit its usage limit)
Branch: agent/typecheck-ci-gate

## Scope

Close TD-01 by making the repository's strict TypeScript check pass without weakening compiler settings or changing runtime behavior. Close the CI build-gating portion of TD-03 by adding an npm typecheck command and requiring typecheck, widget build, server build, and a deterministic extension build/package smoke in GitHub Actions.

## Plan

- Inspect the current diagnostics and classify production, declaration, DOM, discriminant, iterable, and test-mock errors.
- Apply the smallest type-only or behavior-preserving fixes, preserving strict compiler settings.
- Add the typecheck script and CI steps/build smoke.
- Run typecheck, lint, unit tests, all builds, and focused E2E where relevant.
- Record validation and handoff details before committing and opening a draft PR.

## Validation

- `npm run typecheck` — passed with zero diagnostics
- `npm run lint` — passed
- `npm test` — passed: 34 files, 133 tests
- `npm run build` — passed
- `npm run check:extension-package` — passed: six required package files verified
- `npm run build:widget` — passed
- `npm run server:build` — passed
- `git diff --check` — passed

## Decisions / notes

- Do not weaken `tsconfig.json`, add dependencies, or perform unrelated refactors.
- Existing unrelated working-tree files must remain untouched.
- `DOM.Iterable` was added because production code iterates `NodeList`; strictness remains enabled.
- Browser E2E was not required because this slice only corrects types and adds build/package gates; the existing CI smoke and nightly E2E remain in place.
