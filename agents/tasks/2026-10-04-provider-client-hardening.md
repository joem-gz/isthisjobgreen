# Task: Provider client hardening
Owner agent/tool: Codex
Branch: agent/provider-client-hardening

## Scope
Will change:
- Validate provider-returned redirect URLs before they reach DOM URL contexts.
- Add `noopener`/`noreferrer` to external job links.
- Add AbortSignal-based deadlines to Adzuna and Companies House requests.
- Add adversarial unit coverage for malformed schemes and timeout behavior.

Won’t change:
- General server deployment boundary or CORS behavior.
- Rate-limit storage or retry architecture beyond keeping retries absent/bounded.
- Provider API contracts and normalized response/error shapes.

## Files likely touched
- Provider clients/resolvers and shared URL/link rendering helpers.
- Focused unit tests.
- Required handoff note.

## Success criteria
- Only HTTPS provider job URLs are rendered as clickable destinations, with narrowly scoped localhost development support only if existing tests require it.
- External links use `target="_blank"` with `rel="noopener noreferrer"` where applicable.
- Outbound provider requests terminate at a documented bounded deadline.
- Focused tests cover active/malformed schemes and timeout behavior.

## Plan (short)
- Inspect provider clients and all provider URL DOM sinks.
- Add small shared validation/deadline helpers where they reduce duplication.
- Update focused tests and run lint/build/test suites.
- Create handoff, commit, push, and draft PR against `main`.

## Validation (commands)
- `npm run lint`
- focused Vitest files for provider clients and link rendering
- `npm test`
- `npm run build`
- `npm run build:widget`
- `npm run server:build`
- `npx tsc --noEmit` (currently reports pre-existing diagnostics outside this slice)
- artifact check script if present

## Risks / edge cases
- Provider URLs may be absent, relative, or malformed; these must render as non-clickable safe text rather than throw.
- Tests may use localhost HTTP fixtures; keep any exception test-only or narrowly scoped to local development.
- Abort errors must preserve existing normalized provider error behavior.

## Decisions / notes
- No new dependency planned; use `AbortController`, `URL`, and existing test tooling.
- No localhost HTTP exception was added: provider job destinations must be HTTPS.
- The repository's prescribed `./scripts/codex/check-agent-artifacts.sh` is absent; task and handoff artifacts were checked manually.
