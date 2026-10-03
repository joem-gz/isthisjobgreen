import { isIP } from "node:net";

export type ServerEnvironment = Record<string, string | undefined>;

export type ProxyServerConfig = {
  host: string;
  port: number;
  allowedOrigins: string[];
};

export class ServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigError";
  }
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const ALLOWED_ORIGIN_SCHEMES = new Set([
  "http:",
  "https:",
  "chrome-extension:",
  "moz-extension:",
]);

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_PORT;
  }
  if (!/^\d+$/.test(raw.trim())) {
    throw new ServerConfigError("PORT must be an integer between 1 and 65535");
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ServerConfigError("PORT must be an integer between 1 and 65535");
  }
  return port;
}

function validateLoopbackHost(raw: string | undefined): string {
  const host = raw?.trim() || DEFAULT_HOST;
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLoopback || (isIP(host) === 4 && host !== "127.0.0.1")) {
    throw new ServerConfigError(
      "PROXY_HOST must be localhost, 127.0.0.1, or ::1; public binding requires a separate authenticated deployment",
    );
  }
  return host;
}

function validateOrigin(origin: string): string {
  if (origin === "*") {
    throw new ServerConfigError("PROXY_ALLOWED_ORIGINS cannot contain wildcard origins");
  }
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new ServerConfigError("PROXY_ALLOWED_ORIGINS contains an invalid origin");
  }
  if (!ALLOWED_ORIGIN_SCHEMES.has(parsed.protocol) || parsed.username || parsed.password) {
    throw new ServerConfigError(
      "PROXY_ALLOWED_ORIGINS supports only http, https, chrome-extension, and moz-extension origins",
    );
  }
  const expectedPath = parsed.protocol.endsWith("-extension:") ? "" : "/";
  if (parsed.pathname !== expectedPath || parsed.search || parsed.hash || !parsed.host) {
    throw new ServerConfigError("PROXY_ALLOWED_ORIGINS must contain origins without paths");
  }
  return parsed.origin === "null" ? `${parsed.protocol}//${parsed.host}` : parsed.origin;
}

function validateProviderConfiguration(env: ServerEnvironment): void {
  const adzunaAppId = env.ADZUNA_APP_ID?.trim() ?? "";
  const adzunaAppKey = env.ADZUNA_APP_KEY?.trim() ?? "";
  if (Boolean(adzunaAppId) !== Boolean(adzunaAppKey)) {
    throw new ServerConfigError("ADZUNA_APP_ID and ADZUNA_APP_KEY must be configured together");
  }

  const widgetPartners = env.WIDGET_PARTNERS_JSON?.trim() ?? "";
  if (widgetPartners) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(widgetPartners);
    } catch {
      throw new ServerConfigError("WIDGET_PARTNERS_JSON must be valid JSON");
    }
    if (!Array.isArray(parsed)) {
      throw new ServerConfigError("WIDGET_PARTNERS_JSON must be a JSON array");
    }
    for (const partner of parsed) {
      if (!partner || typeof partner !== "object") {
        throw new ServerConfigError("WIDGET_PARTNERS_JSON contains an invalid partner");
      }
      const record = partner as Record<string, unknown>;
      if (typeof record.key !== "string" || !record.key.trim()) {
        throw new ServerConfigError("WIDGET_PARTNERS_JSON partners require a non-empty key");
      }
      if (record.origins !== undefined) {
        if (!Array.isArray(record.origins)) {
          throw new ServerConfigError("WIDGET_PARTNERS_JSON partner origins must be an array");
        }
        for (const origin of record.origins) {
          if (typeof origin !== "string") {
            throw new ServerConfigError("WIDGET_PARTNERS_JSON partner origins must be strings");
          }
          validateOrigin(origin);
        }
      }
    }
  }
}

export function loadProxyServerConfig(env: ServerEnvironment = process.env): ProxyServerConfig {
  validateProviderConfiguration(env);
  const rawOrigins = env.PROXY_ALLOWED_ORIGINS?.trim() ?? "";
  const allowedOrigins = rawOrigins
    ? Array.from(new Set(rawOrigins.split(",").map((origin) => validateOrigin(origin.trim()))))
    : [];
  return {
    host: validateLoopbackHost(env.PROXY_HOST),
    port: parsePort(env.PORT),
    allowedOrigins,
  };
}

export function isAllowedProxyOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  return origin === undefined || allowedOrigins.includes(origin);
}
