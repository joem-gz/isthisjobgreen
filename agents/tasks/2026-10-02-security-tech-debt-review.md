# Task: Security and technical-debt review

Owner agent/tool: Codex
Branch: `agent/security-tech-debt-review`

## Scope

Will change:
- Add an evidence-based, prioritised security and technical-debt review.
- Document review validation and recommended remediation order.

Won't change:
- Application code, dependencies, configuration, or runtime behaviour.
- Existing user-owned untracked files.

## Files likely touched

- `docs/reviews/2026-10-02-security-tech-debt-review.md`
- `agents/tasks/2026-10-02-security-tech-debt-review.md`
- `agents/handoff/agent/security-tech-debt-review.md`

## Success criteria

- Findings cite concrete files and line numbers.
- Recommendations are prioritised and distinguish confirmed issues from deployment-dependent risks.
- Validation results and known limitations are recorded.

## Plan (short)

- Review extension, widget, server, CI, tests, dependencies, and generated bundle characteristics.
- Run repository checks and dependency audits.
- Publish the findings and verify required agent artifacts.

## Validation (commands)

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run server:build`
- `npx tsc --noEmit`
- `npm audit --json`
- `npm audit --omit=dev --json`
- `./scripts/codex/check-agent-artifacts.sh`

## Risks / edge cases

- Some server findings depend on whether infrastructure guarantees loopback-only access or supplies edge controls not present in this repository.
- Dependency audit severity does not imply production exploitability; this project has development dependencies only.

## Decisions / notes

- This is a documentation-only change. No remediation is included so findings can be reviewed and sequenced independently.
- `./scripts/codex/check-agent-artifacts.sh` is not present in this repository; required artifacts were checked manually against `AGENTS.md` and `agents/playbooks.md`.
