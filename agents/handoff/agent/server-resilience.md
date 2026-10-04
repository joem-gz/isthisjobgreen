# Handoff: agent/server-resilience

## Summary
- Bounded every in-memory rate limiter with a configurable bucket cap and deterministic expired-bucket reclamation.
- Validated provider/widget rate-limit settings and Node HTTP timeout settings during startup.
- Applied finite request, header, and keep-alive timeouts to every proxy server instance.
- Documented that the loopback-only service uses the direct socket peer and does not trust forwarding headers.

## Key files
- `server/rate_limit.ts`
- `server/config.ts`
- `server/index.ts`
- `server/widget_service.ts`
- `tests/unit/rate_limit.test.ts`
- `tests/unit/server_config.test.ts`
- `tests/unit/server_boundary.test.ts`
- `server/README.md`

## How to verify
- `npm run lint`
- `npm run typecheck`
- `npm test` — expect 35 files and 142 tests to pass.
- `npm run build`
- `npm run check:extension-package` — expect 6 required files to be verified.
- `npm run build:widget`
- `npm run server:build`
- `git diff --check`

## Behavior changes
- Rate-limit state cannot exceed `maxBuckets` (10,000 by default).
- Expired buckets are reclaimed when capacity is needed; if all buckets remain active, the oldest is evicted.
- Invalid limiter/timeout environment values fail at startup instead of becoming `NaN` or unsafe defaults.
- Incoming request/header/keep-alive timeouts default to 30,000/10,000/5,000 ms.

## Risks / edge cases
- Limits remain per process and are not a substitute for authenticated gateway quotas.
- Oldest-bucket eviction prioritizes a hard memory bound; this is acceptable for the documented loopback deployment, where client-key cardinality is naturally small.
- `X-Forwarded-For` remains ignored intentionally.

## Follow-ups
- Rebased onto merged PR #18; typecheck and all shipped-build checks pass.
- The repository-prescribed artifact script is absent, so task/handoff artifacts were manually checked against `AGENTS.md` and `agents/playbooks.md`.
