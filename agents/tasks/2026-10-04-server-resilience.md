# Task: Bound server resource usage

Owner agent/tool: Codex (continued locally after delegated agent capacity was exhausted)
Branch: agent/server-resilience

## Scope
Will change: in-memory rate-limiter bounds and pruning, operational limit parsing, Node HTTP timeout defaults, focused tests, and server documentation.
Won’t change: provider-client deadlines, public authentication, proxy identity headers, or broader routing architecture.

## Files likely touched
- `server/rate_limit.ts`
- `server/config.ts`
- `server/index.ts`
- `server/README.md`
- focused unit and HTTP-boundary tests

## Success criteria
- Unique client keys cannot grow the rate-limit store beyond a configured cap.
- Expired buckets are reclaimed deterministically.
- Invalid operational limits fail at startup with redacted messages.
- Incoming header/request/keep-alive timeouts are finite and tested.
- The loopback proxy continues to use the socket peer and ignores forwarding headers.

## Plan (short)
- Add bounded, expiry-aware limiter behavior with an injectable clock for deterministic tests.
- Parse and validate provider limiter and HTTP timeout settings in server configuration.
- Construct per-server limiter state and apply Node HTTP timeout properties.
- Add adversarial tests and document defaults/deployment semantics.

## Validation (commands)
- `npm run lint` — passed
- `npm test` — passed: 35 files, 142 tests
- `npm run build` — passed
- `npm run check:extension-package` — passed: 6 required files verified
- `npm run build:widget` — passed
- `npm run server:build` — passed
- `npm run typecheck` — passed after rebasing onto merged PR #18
- `git diff --check` — passed

## Risks / edge cases
- The limiter remains process-local and is not a distributed authorization control.
- Eviction under high cardinality trades perfect per-key continuity for a hard memory bound.

## Decisions / notes
- `X-Forwarded-For` remains deliberately untrusted because the server is loopback-only.
- Provider and widget limiters default to 10,000 buckets; insertion prunes expired buckets and deterministically evicts the oldest bucket only when the cap remains full.
- Incoming request/header/keep-alive defaults are 30s/10s/5s.
- Rebased cleanly onto `main` at `6190178` (merged PR #18) and reran the complete required validation matrix.
