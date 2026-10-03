# Handoff: agent/provider-client-hardening

## Summary
- Added `resolveSafeJobUrl` to reject malformed, active-scheme, HTTP, and credential-bearing provider destinations before they reach the search page's `href` sink.
- Invalid provider destinations render as safe title text; valid HTTPS job links use `target="_blank"` and `rel="noopener noreferrer"`.
- Added configurable AbortController deadlines to Adzuna and Companies House requests, defaulting to 10 seconds and covering response JSON parsing. No retries were introduced.
- Added adversarial URL and timeout tests.

## Key files
- `src/search/job_links.ts`
- `src/pages/search/render.ts`
- `server/adzuna.ts`
- `server/companies_house.ts`
- `tests/unit/job_links.test.ts`
- `tests/unit/search_ui.test.ts`
- `tests/unit/adzuna_proxy.test.ts`
- `tests/unit/companies_house.test.ts`

## How to verify
- `npm run lint`
- `npm test` (117 tests passing)
- `npm run build`
- `npm run build:widget`
- `npm run server:build`
- `git diff --check`

## Behavior changes
- Provider job links that are not absolute HTTPS URLs are no longer clickable.
- Provider calls abort after the configured timeout (`timeoutMs`, default 10 seconds); normalized non-OK errors remain unchanged.

## Risks / edge cases
- Existing providers returning HTTP job URLs will now show non-clickable text; no localhost exception was needed or added.
- Full `npx tsc --noEmit` remains red on pre-existing diagnostics in unrelated files; no diagnostics point to changed production files.

## Follow-ups
- Review and merge this PR before any dependent provider resilience work.
- The repository-prescribed `./scripts/codex/check-agent-artifacts.sh` is absent, so artifact verification was manual.
