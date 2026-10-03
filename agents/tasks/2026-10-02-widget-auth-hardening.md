# Task: Harden widget authentication and request boundary

Owner agent/tool: Codex
Branch: `agent/widget-auth-hardening`
Stacked on: `agent/security-tech-debt-review` / PR #13

## Scope

Will change:
- Remove browser-delivered API keys from the widget integration.
- Restrict the central widget score endpoint to originless server-to-server requests authenticated by partner key.
- Make browser widgets call a same-origin partner endpoint without sending central API credentials.
- Add bounded JSON parsing, content-type enforcement, runtime widget request validation, and a top-level HTTP error boundary.
- Update widget examples, partner documentation, and tests.

Won't change:
- Authentication or CORS for the separate jobs/employer proxy routes.
- Dependency versions or introduce a new authentication dependency.
- Extension permissions, rate-limit storage, or upstream timeout behaviour.

## Files likely touched

- `server/index.ts`
- `server/widget_service.ts`
- `widget/src/index.ts`
- `tests/unit/widget_api.test.ts`
- widget e2e/unit tests and examples as required
- `docs/widget/partner-guide.md`
- `server/README.md`

## Success criteria

- No browser widget option or example embeds/sends a partner API key.
- Origin-bearing calls to the central score API are rejected even with a valid key.
- Valid originless server-to-server calls remain supported.
- Oversized, malformed, and structurally invalid bodies receive bounded 4xx responses without escaping the handler.
- Existing and new focused tests pass.

## Plan (short)

- Separate browser integration from central API authentication.
- Add small dependency-free runtime validators and bounded body parsing.
- Add regression tests for auth, input validation, and request limits.
- Update integration guidance and validate all shipped builds.

## Validation (commands)

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run build:widget`
- `npm run server:build`
- `npx tsc --noEmit` (known baseline failures from PR #13 will be compared)
- `./scripts/codex/check-agent-artifacts.sh` if present; otherwise manual artifact verification

## Risks / edge cases

- This intentionally changes client-side integration: direct cross-origin calls with embedded keys stop working.
- Partners must expose a same-origin score endpoint or use SSR; their server retains the central API key.
- Existing server-to-server callers without an `Origin` header continue to work.

## Decisions / notes

- A browser cannot keep a shared API secret. The bounded design removes that impossible guarantee instead of adding origin checks that non-browser callers can spoof.
- No new token format or cryptographic dependency is introduced; a future delegated-token design can be evaluated separately if direct browser-to-central-API calls are required.
- The central endpoint now treats `origins` as allowed request `jobUrl` origins, not as a CORS authentication mechanism.
- Validation completed: lint; 108 unit tests; extension, widget, and server builds; and three widget E2E tests all pass.
- Local HTTP smoke validation returned 200 for a valid originless server request, 403 with `Origin`, 400 for a `null` body, and 413 for a declared 40,000-byte body.
- `tsc --noEmit` still fails on 35 pre-existing diagnostics outside this slice, down from the 42 diagnostics recorded in PR #13; this branch introduces no new diagnostics.
- `./scripts/codex/check-agent-artifacts.sh` is not present, so artifacts are checked manually against `AGENTS.md` and `agents/playbooks.md`.
