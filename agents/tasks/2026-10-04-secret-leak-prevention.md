# Task: Add secret-leak prevention

Owner agent/tool: Codex
Branch: agent/secret-leak-prevention

## Scope
Will change: add automated secret scanning for pull requests/pushes, provide a pinned pre-commit hook, and document safe credential storage and rotation.
Won’t change: inspect, copy, rotate, or commit any real credentials; change application authentication; or modify unrelated CI jobs.

## Files likely touched
- `.github/workflows/secret-scan.yml`
- `.pre-commit-config.yaml`
- `docs/security/credential-handling.md`
- focused README links if needed

## Success criteria
- Secret scanning runs with read-only repository permissions and full history on pushes and pull requests.
- Action and scanner versions are pinned.
- Developers can enable an equivalent staged-file pre-commit check.
- Documentation explains storage, rotation, incident response, and placeholder-only examples without containing credential material.

## Plan (short)
- Add a dedicated workflow to avoid colliding with the parallel CI/typecheck branch.
- Add the upstream Gitleaks pre-commit hook pinned to the same scanner release.
- Document credential lifecycle and validation commands.
- Scan the repository/history, lint configuration, and run the existing lightweight checks.

## Validation (commands)
- `gitleaks git --redact --verbose .`
- `pre-commit run gitleaks --all-files`
- YAML/config parsing
- `npm run lint`
- `git diff --check`

## Risks / edge cases
- History scanning requires a full checkout and may reveal an existing leak; output must remain redacted.
- False positives should be handled with narrowly scoped fingerprints, never broad path/rule exclusions.
- GitHub Action releases and scanner versions are external supply-chain inputs and must remain pinned.

## Decisions / notes
- Use Gitleaks because it provides the same scanner for CI and local staged changes.
- Keep this workflow separate from `ci.yml` so it can be reviewed and rebased independently of PR #18.
- Current official versions reviewed on 2026-10-04: Gitleaks `v8.30.1` and Gitleaks Action `v3` commit `e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e`.
- The workflow grants only `contents: read`, checks out full history, pins both actions by full commit SHA, and pins the downloaded scanner with `GITLEAKS_VERSION`.
- The Gitleaks `v8.30.1` macOS arm64 archive matched its published SHA-256 (`b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5`).
- Validation completed:
  - direct redacted full-history scan passed (70 commits, no leaks)
  - pinned pre-commit hook passed on the staged change
  - both YAML files parsed successfully
  - `npm run lint` passed
  - `npm test` passed (34 files, 133 tests)
  - `git diff --check` passed
- The repository-prescribed `./scripts/codex/check-agent-artifacts.sh` helper is absent. Artifact verification was completed manually: branch scope, task note, handoff note, staged-file list, and cached diff all passed review.
