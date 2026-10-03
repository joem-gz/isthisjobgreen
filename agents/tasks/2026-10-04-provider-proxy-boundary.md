# Task: Harden provider proxy network boundary
Owner agent/tool: Codex
Branch: agent/provider-proxy-boundary

## Scope
Will change:
- Bind the local provider proxy to loopback by default.
- Replace wildcard CORS with explicit local/extension origin handling.
- Validate bind/port and provider configuration at startup with redacted failures.
- Add HTTP-boundary tests for the safe defaults and configuration failures.
- Update local proxy documentation.

Won’t change:
- Public authentication or deployment architecture.
- Widget server-to-server authentication and scoring behavior.
- Provider client semantics beyond startup configuration validation.

## Files likely touched
- server/index.ts
- server/config.ts or focused configuration module
- tests/unit/server_boundary.test.ts
- server/README.md
- README.md (only if startup behavior needs clarification)

## Success criteria
- Default listener is loopback-only and does not use wildcard CORS.
- Explicit allowed origins are required for browser/extension cross-origin access.
- Invalid host, port, origin, or provider configuration fails before listening without leaking secrets.
- HTTP tests cover preflight and normal requests at the boundary.

## Plan (short)
- Extract pure startup/origin configuration validation helpers.
- Apply validated host and exact CORS origin matching to the HTTP server.
- Keep server-to-server widget route behavior unchanged.
- Add focused tests and run broader checks.

## Validation (commands)
- `npm test -- tests/unit/server_config.test.ts tests/unit/server_boundary.test.ts` — 12 passed
- `npm run lint` — passed
- `npm run server:build` — passed
- `npm test` — 31 files / 120 tests passed
- `npm run build` — passed
- `npm run build:widget` — passed
- `npx tsc --noEmit --pretty false` — pre-existing diagnostics only; no diagnostics in changed files
- `PROXY_HOST=0.0.0.0 node server/dist/index.js` — exits 1 before listening with a redacted configuration error
- `git diff --check` — passed

## Risks / edge cases
- Chrome extension origins are exact `chrome-extension://<id>` values; wildcard origins must not be accepted.
- Local extension usage may need an explicit environment allowlist.
- The default local UI has no cross-origin allowance unless configured.

## Decisions / notes
- This slice treats the provider proxy as local-only. A public deployment requires a separate authenticated gateway design.
- The HTTP boundary tests use an ephemeral loopback port through the exported `createProxyServer` factory; production startup still uses the validated configured port.
- The sandbox denied binding a fixed port for an external curl smoke test (`listen EPERM`), while the in-process HTTP boundary tests passed.
