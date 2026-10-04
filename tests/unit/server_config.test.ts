import { describe, expect, it } from "vitest";
import {
  isAllowedProxyOrigin,
  loadProxyServerConfig,
  ServerConfigError,
} from "../../server/config";

describe("provider proxy server configuration", () => {
  it("defaults to a loopback listener with no browser origins", () => {
    expect(loadProxyServerConfig({})).toEqual({
      host: "127.0.0.1",
      port: 8787,
      allowedOrigins: [],
      providerRateLimit: { windowMs: 60_000, max: 60, maxBuckets: 10_000 },
      widgetRateLimit: { windowMs: 60_000, max: 120, maxBuckets: 10_000 },
      httpTimeouts: { requestMs: 30_000, headersMs: 10_000, keepAliveMs: 5_000 },
    });
  });

  it("accepts explicit local and extension origins", () => {
    expect(
      loadProxyServerConfig({
        PROXY_HOST: "localhost",
        PORT: "8899",
        PROXY_ALLOWED_ORIGINS:
          "http://localhost:3000,chrome-extension://abcdefghijklmnop",
      }),
    ).toEqual({
      host: "localhost",
      port: 8899,
      allowedOrigins: [
        "http://localhost:3000",
        "chrome-extension://abcdefghijklmnop",
      ],
      providerRateLimit: { windowMs: 60_000, max: 60, maxBuckets: 10_000 },
      widgetRateLimit: { windowMs: 60_000, max: 120, maxBuckets: 10_000 },
      httpTimeouts: { requestMs: 30_000, headersMs: 10_000, keepAliveMs: 5_000 },
    });
  });

  it.each([
    ["PROXY_HOST", { PROXY_HOST: "0.0.0.0" }],
    ["PORT", { PORT: "70000" }],
    ["PROXY_ALLOWED_ORIGINS", { PROXY_ALLOWED_ORIGINS: "*" }],
    ["PROXY_ALLOWED_ORIGINS", { PROXY_ALLOWED_ORIGINS: "https://example.test/path" }],
    ["ADZUNA credentials", { ADZUNA_APP_ID: "id" }],
    ["widget partners", { WIDGET_PARTNERS_JSON: "not-json" }],
    [
      "widget partner rate limit",
      {
        WIDGET_PARTNERS_JSON:
          '[{"key":"partner","rateLimit":{"windowMs":60000,"max":0}}]',
      },
    ],
    ["rate limit window", { RATE_LIMIT_WINDOW_MS: "0" }],
    ["rate limit buckets", { RATE_LIMIT_MAX_BUCKETS: "100001" }],
    ["widget rate limit", { WIDGET_RATE_LIMIT_MAX: "NaN" }],
    [
      "header timeout ordering",
      { PROXY_REQUEST_TIMEOUT_MS: "5000", PROXY_HEADERS_TIMEOUT_MS: "6000" },
    ],
  ])("rejects unsafe %s configuration", (_name, env) => {
    expect(() => loadProxyServerConfig(env)).toThrow(ServerConfigError);
  });

  it("matches only exact configured origins", () => {
    const config = loadProxyServerConfig({
      PROXY_ALLOWED_ORIGINS: "http://localhost:3000",
    });
    expect(isAllowedProxyOrigin(undefined, config.allowedOrigins)).toBe(true);
    expect(isAllowedProxyOrigin("http://localhost:3000", config.allowedOrigins)).toBe(true);
    expect(isAllowedProxyOrigin("http://localhost:3001", config.allowedOrigins)).toBe(false);
    expect(isAllowedProxyOrigin("https://localhost:3000", config.allowedOrigins)).toBe(false);
  });
});
