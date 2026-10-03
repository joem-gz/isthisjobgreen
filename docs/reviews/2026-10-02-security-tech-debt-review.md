# Security and technical-debt review

Date: 2026-10-02

Scope: `gsc-jobsearchplugin` at `67f771f` (`main`)

Method: static review of extension, widget, raw Node HTTP service, build/CI, tests, and dependencies. No fixes were applied.

## Executive summary

The repository has useful baseline controls: untrusted UI text is usually rendered with safe DOM APIs, provider secrets stay server-side, local `.env` files are ignored, the lockfile is committed, and 92 unit tests pass. The production dependency audit reports no findings.

The most important risks are at the browser/server boundary. Client-side widget API keys are public by construction, while the service treats them as credentials and accepts valid-key requests with no `Origin`. The server buffers POST bodies without limits and casts parsed JSON to a request type without runtime validation or a top-level error boundary. Separately, provider-backed routes are unauthenticated, permit every browser origin, and the process listens beyond loopback unless infrastructure constrains it.

The leading technical-debt issue is that strict TypeScript is configured but not enforced: `tsc --noEmit` currently reports 42 diagnostics while CI relies on esbuild, which transpiles without type-checking. The leading performance/deployment issue is a 6.9 MB location index being embedded into several approximately 7 MB bundles, including a content script injected on every HTTP(S) page.

## Prioritised recommendations

### P0 — before public deployment

1. Redesign widget authorization and close the missing-`Origin` bypass (SEC-01).
2. Add bounded body parsing, runtime request validation, and a top-level server error boundary (SEC-02).
3. Decide whether the provider proxy is local-only or public, then bind/authenticate and configure CORS accordingly (SEC-03).
4. Restore a passing TypeScript check and make it required in CI (TD-01).

### P1 — next hardening/debt sprint

5. Reduce extension permissions and constrain the service-worker fetch broker (SEC-04).
6. Fix widget cache-key integrity and validate upstream job-link schemes (SEC-05 and SEC-06).
7. Upgrade or remove vulnerable build tooling, especially unused Vitest UI; isolate or replace SheetJS (SEC-07).
8. Stop duplicating the multi-megabyte location index across extension and server bundles (TD-02).
9. Add HTTP-boundary/adversarial tests and build all shipped surfaces in CI (TD-03).

### P2 — planned maintenance

10. Make rate limiting bounded and deployment-aware; add upstream timeouts (SEC-08).
11. Add automated secret scanning and document credential rotation (SEC-09).
12. Split large modules, validate startup configuration, and document stable legacy integration identifiers (TD-04 to TD-06).

## Security findings

### SEC-01 — High: browser-visible key is treated as authorization

- **Location:** `docs/widget/partner-guide.md:35`, `widget/src/index.ts:440`, `server/widget_service.ts:373`
- **Evidence:** client integrations embed `apiKey` in JavaScript and send it as `X-API-Key`. The server rejects a disallowed origin only when an origin exists: `if (origin && !isOriginAllowed(origin, partner))`. Non-browser clients can omit or spoof `Origin`.
- **Impact:** anyone able to read a partner page can reuse its key directly, consume quota, submit arbitrary scores, and interact with partner caches outside the intended site. CORS is not authentication for non-browser callers.
- **Fix:** treat browser keys as public identifiers. Prefer the documented SSR integration with server-to-server credentials. If client-side scoring remains, use short-lived signed tokens scoped to partner, job, and expiry, with partner quotas and abuse detection. At minimum, reject missing origins on the browser lane.
- **Mitigation/uncertainty:** rotate existing keys after redesign. Risk is lower if the endpoint is strictly local and keys carry no cost or privilege.

### SEC-02 — High: unbounded and unvalidated requests can deny service

- **Location:** `server/index.ts:209`, `server/index.ts:404`, `server/index.ts:427`, `server/widget_service.ts:223`, `server/widget_service.ts:403`
- **Evidence:** `readJsonBody` buffers all chunks without a byte limit. Parsed JSON is cast to `WidgetScoreRequest`; a valid-key body of JSON `null` reaches `request.jobUrl` and throws. URL construction also trusts the `Host` header and the async request callback has no final error boundary.
- **Impact:** large bodies can exhaust memory, while malformed authenticated requests or request metadata can produce unhandled rejection/process-failure or hung-response behavior.
- **Fix:** cap bodies at a small explicit size, require JSON content type, validate a strict request schema with bounded strings and finite/ranged coordinates, use a fixed URL base rather than `Host`, and wrap the whole handler in a production-safe error boundary.
- **Mitigation/uncertainty:** also enforce limits at the reverse proxy. No such gateway controls are visible in this repository.

### SEC-03 — High if network-exposed: open provider-credential proxy

- **Location:** `server/index.ts:160`, `server/index.ts:398`, `server/index.ts:445`, `server/index.ts:470`
- **Evidence:** search/employer routes have no authentication, return `Access-Control-Allow-Origin: *`, and `server.listen(PORT)` omits a host even though the log advertises `localhost`.
- **Impact:** when reachable from a LAN or the internet, third parties can consume paid/provider quota through the service. The in-memory rate limiter is not an authorization boundary.
- **Fix:** for local mode, bind `127.0.0.1` and permit only intended local/extension origins. For public mode, authenticate clients, use exact CORS allowlists, apply edge quotas, and separate public endpoints from credential-backed proxy routes.
- **Mitigation/uncertainty:** firewall the port and cap provider quota. Severity is Low if deployment independently guarantees loopback-only access.

### SEC-04 — Medium: all-site extension privileges and generic fetch broker

- **Location:** `src/manifest.json:6`, `src/manifest.json:16`, `src/service_worker.ts:23`, `src/service_worker.ts:52`, `src/messages.ts:17`
- **Evidence:** the extension requests all HTTP(S) hosts, injects its content script on all HTTP(S) pages, and lets extension messages supply an arbitrary fetch URL without checking sender, protocol, hostname, or path.
- **Impact:** this increases permissions, privacy/performance exposure, and the blast radius of any future extension compromise.
- **Fix:** restrict content-script matches to supported job sites and host permissions to exact APIs; put localhost permissions in a development manifest; replace the generic broker with typed endpoint-specific messages or an exact destination allowlist; validate message shape and sender.
- **False-positive note:** the isolated content-script world limits direct access from normal page scripts, but the privileges remain broader than required.

### SEC-05 — Medium: widget cache poisoning through `jobUrl`

- **Location:** `server/widget_service.ts:223`, `server/widget_service.ts:302`, `server/widget_service.ts:403`
- **Evidence:** when `jobUrl` exists it becomes the entire cache seed, excluding location, coordinates, and remote status. The first result can remain cached for up to seven days.
- **Impact:** a caller holding a browser-visible partner key can submit altered coordinates for a legitimate URL and cause later callers to receive the poisoned score.
- **Fix:** include every score-affecting normalized field in the key, validate the URL against the configured partner origin, and derive authoritative job data server-side where possible.

### SEC-06 — Medium: unvalidated upstream URL reaches an anchor

- **Rule:** JS-URL-002
- **Location:** `server/adzuna.ts:77`, `src/pages/search/render.ts:94`
- **Evidence:** an upstream `redirect_url` is copied into the API response and assigned directly to `link.href`. Text values correctly use `textContent`, but this URL context has no scheme or host validation.
- **Impact:** a compromised or malformed upstream response could create phishing links or active schemes.
- **Fix:** parse with `new URL`, allow only `https:` plus explicit localhost development exceptions, optionally allowlist expected redirect hosts, and render plain text for invalid URLs. Add `noopener` explicitly alongside `noreferrer`.

### SEC-07 — Medium build-chain risk: vulnerable development tooling

- **Location:** `package.json:12`, `scripts/build_ons_intensity.mjs:3`, `.github/workflows/ci.yml:32`
- **Evidence:** full `npm audit` reports 19 development-tree findings: 2 critical, 11 high, and 6 moderate. They include Vitest/Vitest UI file-read/execution advisories and SheetJS prototype-pollution/ReDoS advisories. `npm audit --omit=dev` reports zero production findings. `@vitest/ui` appears unused, while `xlsx` processes the ONS workbook and has no npm-provided fix on the installed line.
- **Impact:** runtime bundles are not directly affected, but developers and CI may be exposed through test/dev servers or processing untrusted build inputs.
- **Fix:** remove unused Vitest UI, upgrade Vitest/Vite and the lockfile, update CSV/ZIP tooling, and replace or isolate `xlsx`. Only accept pinned, checksum-verified input workbooks.
- **False-positive note:** audit severity does not equal application exploitability; all declared packages are development dependencies.

### SEC-08 — Medium operational risk: rate limiting and upstream fetches

- **Location:** `server/rate_limit.ts:18`, `server/index.ts:457`, `server/adzuna.ts:96`, `server/companies_house.ts:121`
- **Evidence:** limiter buckets for unique keys are never proactively pruned; `remoteAddress` will often be the reverse proxy rather than the user; upstream fetches have no abort timeout.
- **Impact:** memory can grow with unique sources, rate limits can be ineffective or block all users together, and slow upstreams can consume connections indefinitely.
- **Fix:** use a bounded expiry-aware store, define trusted proxy handling at the edge, and add short upstream timeouts with bounded retries.

### SEC-09 — Medium operational hygiene: local credentials lack leak detection

- **Location:** ignored `server/.env:1`, `.gitignore:10`, `.github/workflows/ci.yml:16`
- **Evidence:** the local file contains credential-shaped non-placeholder values. It is ignored and no tracked history was found, which is good. No secret-scanning configuration is visible.
- **Impact:** credentials can still leak through archives, logs, screenshots, workspace sharing, or an accidental force-add.
- **Fix:** rotate them if real and previously shared, store them in an OS/cloud secret manager, add pre-commit and CI secret scanning, and retain placeholders only in `.env.example`.

## Technical-debt findings

### TD-01 — P0: TypeScript is strict but not enforced

- **Location:** `tsconfig.json:2`, `.github/workflows/ci.yml:32`; representative defects at `server/widget_service.ts:269`, `src/service_worker.ts:65`, and `src/employer/api.ts:161`
- **Evidence:** `npx tsc --noEmit` reports 42 diagnostics: implicit `any`, missing CSS declarations, nullable DOM references, an impossible `unknown` score status, and inaccurate test mocks. esbuild succeeds because it does not type-check, and CI does not run `tsc`.
- **Recommendation:** correct production types, add CSS module declarations, then repair test mocks. Add a `typecheck` script and required CI step. Separate application and test tsconfigs if their browser/Node/jsdom ambient types conflict.

### TD-02 — P0/P1: location dataset is duplicated across large bundles

- **Location:** `src/geo/place_resolver.ts:1`, `src/manifest.json:7`, `scripts/build.mjs:7`
- **Evidence:** `src/data/uk_places_index.json` is 6.9 MB and statically imported. Current content-script, service-worker, search-page, and server outputs are each about 7 MB, with approximately 12 MB sourcemaps. The content script runs on every HTTP(S) page.
- **Impact:** unnecessary install size, memory/startup cost, build time, and per-page injection overhead.
- **Recommendation:** narrow content-script matches first. Keep location resolution in one extension context and use typed messages; load/index data lazily or generate a compact index. Produce clean build directories, publish sourcemaps separately where appropriate, and enforce bundle-size budgets.

### TD-03 — P1: CI misses shipped surfaces and adversarial server cases

- **Location:** `.github/workflows/ci.yml:32`, `package.json:6`, `tests/unit/widget_api.test.ts:27`
- **Evidence:** CI builds only the extension, not the server or widget. Server tests target service functions rather than the HTTP boundary. There are no tests for missing origin, null/array payloads, body limits, malformed request metadata, bounds, cache poisoning, upstream timeouts, or proxy-aware rate limiting.
- **Recommendation:** add server/widget builds, typecheck, and HTTP-level tests using an injected handler or ephemeral listener. Include adversarial cases and an extension package/install smoke check.

### TD-04 — P1/P2: large modules mix responsibilities

- **Location:** `src/features/page_score/index.ts` (~1,098 lines), `widget/src/index.ts` (~763), `server/index.ts` (~472), `server/widget_service.ts` (~441)
- **Impact:** DOM construction, state, extraction, networking, authorization, routing, parsing, and configuration are difficult to test independently and create broad regression risk.
- **Recommendation:** extract server configuration, parsing, handlers, and HTTP adapter; split page score into view/state/employer orchestration; split widget extraction/render/API client. Keep each refactor behavior-preserving.

### TD-05 — P2: configuration parsing fails silently

- **Location:** `server/index.ts:47`, `server/index.ts:71`, `server/widget_service.ts:257`
- **Evidence:** malformed numeric environment variables can become `NaN`, invalid partner JSON silently becomes an empty list, and `.env` read failures are swallowed.
- **Recommendation:** validate all configuration at startup, enforce safe numeric ranges, fail fast with redacted diagnostics, and distinguish an absent optional file from invalid configuration.

### TD-06 — P2: rebrand leaves an ambiguous public compatibility contract

- **Location:** `docs/widget/partner-guide.md:15`, `server/widget_service.ts:412`, `widget/src/index.ts:47`
- **Evidence:** user-facing copy uses IsThisJobGreen?, while public globals, data attributes, CSS classes, cache headers, storage keys, and an API hostname example retain CarbonRank identifiers.
- **Impact:** compatibility may be intentional, but the contract is undocumented and invites an accidental breaking mass rename.
- **Recommendation:** explicitly declare legacy identifiers stable compatibility API, or publish a versioned migration with aliases and deprecation dates.

## Positive controls observed

- Most untrusted text uses `textContent` and constructed DOM nodes rather than HTML parsing.
- No production `eval`, `new Function`, or `document.write` was found.
- Provider API credentials remain server-side.
- `.env` is ignored and was not found in tracked Git history.
- Unit suite: 28 files and 92 tests, all passing.
- Lint, extension build, and server build pass.
- `npm audit --omit=dev` reports zero production findings.

## Validation performed

- `npm run lint` — passed
- `npm test` — passed: 28 files, 92 tests
- `npm run build` — passed
- `npm run server:build` — passed
- `npx tsc --noEmit` — failed with 42 diagnostics; documented as TD-01
- `npm audit --json` — 19 development/build-tree findings; documented as SEC-07
- `npm audit --omit=dev --json` — zero production findings

## Suggested sequencing

- **Week 1:** SEC-01 to SEC-03 and TD-01, with regression tests.
- **Week 2:** SEC-04 to SEC-06, HTTP-boundary tests, and complete CI builds.
- **Week 3:** dependency/tooling remediation and TD-02 bundle redesign.
- **Then:** operational hardening and modularisation through small, separately reviewable branches.
