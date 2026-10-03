# Handoff: agent/provider-proxy-boundary

## Summary
- Made the provider proxy loopback-only by default (`127.0.0.1`).
- Replaced wildcard CORS with exact, opt-in `PROXY_ALLOWED_ORIGINS` matching.
- Added startup validation for loopback host, port, Adzuna credential pairing, widget partner JSON, and partner origins. Errors name only the invalid setting and never log secret values.
- Added an exported server factory so the HTTP boundary is directly testable without opening a fixed port in tests.
- Kept widget score server-to-server origin rejection unchanged.
- Documented that public exposure requires a separate authenticated gateway.

## Key files
- `server/config.ts`
- `server/index.ts`
- `tests/unit/server_config.test.ts`
- `tests/unit/server_boundary.test.ts`
- `server/README.md`

## How to verify
- `npm test -- tests/unit/server_config.test.ts tests/unit/server_boundary.test.ts`
- `npm run lint`
- `npm run server:build`
- `npm test`
- `npm run build`
- `npm run build:widget`

Expected result: focused tests pass (12 tests), full suite passes (120 tests), lint/build commands pass.

## Behavior changes
- Default listener changed from an unspecified bind to `127.0.0.1:8787`.
- Search/employer endpoints no longer emit `Access-Control-Allow-Origin: *`.
- Cross-origin browser requests require exact configured origins; originless local/service calls remain supported.
- Invalid public bind attempts and malformed provider configuration fail before listening.

## Risks / edge cases
- Extension origins must be configured exactly, for example `chrome-extension://<extension-id>`.
- A public deployment is intentionally unsupported by this slice and needs an authenticated gateway design.
- `npx tsc --noEmit` still reports pre-existing diagnostics elsewhere in the repository; changed files introduced none.
- A fixed-port external curl smoke test was blocked by the sandbox's bind policy; in-process HTTP tests use an ephemeral loopback port and passed.

## Follow-ups
- Configure `PROXY_ALLOWED_ORIGINS` in any local browser/extension development environment that needs cross-origin calls.
- Keep deployment firewalling and provider quota controls as defense in depth.
