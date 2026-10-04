import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createLruCache } from "./cache";
import { fetchAdzunaJobs, SearchQuery } from "./adzuna";
import {
  CompaniesHouseProfile,
  EmployerCandidate,
  fetchCompaniesHouseProfile,
  fetchCompaniesHouseSearch,
  rankCompanies,
} from "./companies_house";
import { loadOnsIntensityMap, resolveOnsIntensity } from "./ons_intensity";
import { loadSbtiSnapshot, matchSbtiCompany, SbtiMatchResult } from "./sbti_snapshot";
import { createRateLimiter } from "./rate_limit";
import { isJsonContentType, readJsonBody, RequestBodyError } from "./request_body";
import {
  isAllowedProxyOrigin,
  loadProxyServerConfig,
  ProxyServerConfig,
} from "./config";
import { CommuteMode } from "../src/storage/settings";
import {
  createWidgetService,
  parseWidgetPartners,
  validateWidgetScoreRequest,
} from "./widget_service";

type ProxyResponse = {
  results: Awaited<ReturnType<typeof fetchAdzunaJobs>>["results"];
  count: number;
  page: number;
  cached: boolean;
};

type EmployerResolveResponse = {
  candidates: EmployerCandidate[];
  cached: boolean;
};

type EmployerSignalsResponse = {
  company_number: string;
  sic_codes: string[];
  sector_intensity_band: string;
  sector_intensity_value: number | null;
  sector_intensity_sic_code: string | null;
  sector_description: string | null;
  sbti: SbtiMatchResult | null;
  sources: string[];
  cached: boolean;
};

function loadEnvFile(path: string): void {
  try {
    const contents = readFileSync(path, "utf-8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const [key, ...valueParts] = trimmed.split("=");
      if (!key || valueParts.length === 0) {
        continue;
      }
      const rawValue = valueParts.join("=").trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
  }
}

loadEnvFile(resolve(process.cwd(), "server", ".env"));

let proxyServerConfig: ProxyServerConfig;
try {
  proxyServerConfig = loadProxyServerConfig(process.env);
} catch (error) {
  const message = error instanceof Error ? error.message : "Invalid server configuration";
  console.error(`[AdzunaProxy] Configuration error: ${message}`);
  process.exit(1);
}
const CACHE_TTL_MS = Number.parseInt(process.env.CACHE_TTL_MS ?? "600000", 10);
const CACHE_MAX = Number.parseInt(process.env.CACHE_MAX ?? "200", 10);
const WIDGET_PARTNERS = parseWidgetPartners(process.env.WIDGET_PARTNERS_JSON);
const WIDGET_CACHE_MAX = Number.parseInt(process.env.WIDGET_CACHE_MAX ?? "500", 10);
const WIDGET_HOME_LAT = parseNumber(process.env.WIDGET_HOME_LAT) ?? 51.5074;
const WIDGET_HOME_LON = parseNumber(process.env.WIDGET_HOME_LON) ?? -0.1278;
const WIDGET_COMMUTE_MODE = parseCommuteMode(process.env.WIDGET_COMMUTE_MODE) ?? "car";
const WIDGET_OFFICE_DAYS = parseOfficeDays(process.env.WIDGET_OFFICE_DAYS) ?? 3;
const EMPLOYER_RESOLVE_TTL_MS = Number.parseInt(
  process.env.EMPLOYER_RESOLVE_TTL_MS ?? String(7 * 24 * 60 * 60 * 1000),
  10,
);
const EMPLOYER_PROFILE_TTL_MS = Number.parseInt(
  process.env.EMPLOYER_PROFILE_TTL_MS ?? String(30 * 24 * 60 * 60 * 1000),
  10,
);
const EMPLOYER_CACHE_MAX = Number.parseInt(
  process.env.EMPLOYER_CACHE_MAX ?? "500",
  10,
);

const cache = createLruCache<ProxyResponse>({
  ttlMs: CACHE_TTL_MS,
  maxSize: CACHE_MAX,
});
const employerResolveCache = createLruCache<EmployerResolveResponse>({
  ttlMs: EMPLOYER_RESOLVE_TTL_MS,
  maxSize: EMPLOYER_CACHE_MAX,
});
const employerProfileCache = createLruCache<CompaniesHouseProfile>({
  ttlMs: EMPLOYER_PROFILE_TTL_MS,
  maxSize: EMPLOYER_CACHE_MAX,
});
const onsIntensityMap = loadOnsIntensityMap();
const sbtiSnapshot = loadSbtiSnapshot();
const widgetService = createWidgetService({
  partners: WIDGET_PARTNERS,
  cacheMax: WIDGET_CACHE_MAX,
  defaultHome: { lat: WIDGET_HOME_LAT, lon: WIDGET_HOME_LON },
  defaultCommuteMode: WIDGET_COMMUTE_MODE,
  defaultOfficeDays: WIDGET_OFFICE_DAYS,
  defaultRateLimit: proxyServerConfig.widgetRateLimit,
});

function sendJson(
  response: import("node:http").ServerResponse,
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {},
): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
}

function sendEmpty(
  response: import("node:http").ServerResponse,
  statusCode: number,
  headers: Record<string, string> = {},
): void {
  response.writeHead(statusCode, headers);
  response.end();
}

function setSearchCorsHeaders(
  response: import("node:http").ServerResponse,
  origin: string | undefined,
): void {
  if (origin === undefined) {
    return;
  }
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseNumber(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolean(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  return value === "1" || value.toLowerCase() === "true";
}

function parseCommuteMode(value: string | null | undefined): CommuteMode | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (
    normalized === "car" ||
    normalized === "bus" ||
    normalized === "rail" ||
    normalized === "walk" ||
    normalized === "cycle"
  ) {
    return normalized as CommuteMode;
  }
  return undefined;
}

function parseOfficeDays(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.min(5, Math.max(0, parsed));
}

function parseSearchQuery(url: URL): SearchQuery {
  const queryText = url.searchParams.get("q") ?? "";
  const where = url.searchParams.get("where") ?? "";
  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1;
  const radiusKm = parseNumber(url.searchParams.get("radius_km"));
  const remoteOnly = parseBoolean(url.searchParams.get("remote_only"));

  return {
    q: queryText,
    where,
    page,
    radiusKm,
    remoteOnly,
  };
}

function buildCacheKey(query: SearchQuery): string {
  return JSON.stringify({
    q: query.q,
    where: query.where,
    page: query.page,
    radiusKm: query.radiusKm,
    remoteOnly: query.remoteOnly,
  });
}

function buildEmployerResolveCacheKey(name: string, hintLocation: string): string {
  return JSON.stringify({
    name: name.trim().toLowerCase(),
    hint_location: hintLocation.trim().toLowerCase(),
  });
}

async function handleJobsSearch(
  url: URL,
  response: import("node:http").ServerResponse,
): Promise<void> {
  const appId = process.env.ADZUNA_APP_ID ?? "";
  const appKey = process.env.ADZUNA_APP_KEY ?? "";
  if (!appId || !appKey) {
    sendJson(response, 500, { error: "Missing Adzuna credentials" });
    return;
  }
  
  const query = parseSearchQuery(url);
  const cacheKey = buildCacheKey(query);
  const cached = cache.get(cacheKey);
  if (cached) {
    sendJson(response, 200, { ...cached, cached: true });
    return;
  }

  try {
    const result = await fetchAdzunaJobs(query, { appId, appKey, country: "gb" });
    const payload: ProxyResponse = {
      results: result.results,
      count: result.count,
      page: query.page,
      cached: false,
    };
    cache.set(cacheKey, payload);
    sendJson(response, 200, payload);
  } catch (error) {
    console.error("[AdzunaProxy] Search failed", error);
    sendJson(response, 502, { error: "Failed to fetch Adzuna search results" });
  }
}

async function handleEmployerResolve(
  url: URL,
  response: import("node:http").ServerResponse,
): Promise<void> {
  const name = url.searchParams.get("name")?.trim() ?? "";
  if (!name) {
    sendJson(response, 400, { error: "Missing employer name" });
    return;
  }

  const apiKey = process.env.COMPANIES_HOUSE_API_KEY ?? "";
  if (!apiKey) {
    sendJson(response, 500, { error: "Missing Companies House API key" });
    return;
  }

  const hintLocation = url.searchParams.get("hint_location")?.trim() ?? "";
  const cacheKey = buildEmployerResolveCacheKey(name, hintLocation);
  const cached = employerResolveCache.get(cacheKey);
  if (cached) {
    sendJson(response, 200, { ...cached, cached: true });
    return;
  }

  try {
    const searchResponse = await fetchCompaniesHouseSearch(name, { apiKey });
    const candidates = rankCompanies(
      name,
      searchResponse.items ?? [],
      hintLocation,
    );
    const payload: EmployerResolveResponse = {
      candidates,
      cached: false,
    };
    employerResolveCache.set(cacheKey, payload);
    sendJson(response, 200, payload);
  } catch (error) {
    console.error("[EmployerResolve] Search failed", error);
    sendJson(response, 502, { error: "Failed to resolve employer" });
  }
}

async function handleEmployerSignals(
  url: URL,
  response: import("node:http").ServerResponse,
): Promise<void> {
  const companyNumber = url.searchParams.get("company_number")?.trim() ?? "";
  if (!companyNumber) {
    sendJson(response, 400, { error: "Missing company_number" });
    return;
  }

  const apiKey = process.env.COMPANIES_HOUSE_API_KEY ?? "";
  if (!apiKey) {
    sendJson(response, 500, { error: "Missing Companies House API key" });
    return;
  }

  try {
    const companyName = url.searchParams.get("company_name")?.trim() ?? "";
    const cachedProfile = employerProfileCache.get(companyNumber);
    let profile = cachedProfile;
    let cached = false;
    if (!profile) {
      profile = await fetchCompaniesHouseProfile(companyNumber, { apiKey });
      employerProfileCache.set(companyNumber, profile);
    } else {
      cached = true;
    }

    const sicCodes = Array.isArray(profile.sic_codes)
      ? profile.sic_codes.filter(Boolean)
      : [];
    const intensity = resolveOnsIntensity(sicCodes, onsIntensityMap);
    const sources = ["companies_house"];
    if (intensity.value !== null) {
      sources.push("ons");
    }
    const sbtiName = companyName || profile.company_name || "";
    const sbtiMatch = matchSbtiCompany(sbtiName, sbtiSnapshot);
    if (sbtiMatch.match_status !== "no_match") {
      sources.push("sbti");
    }
    const payload: EmployerSignalsResponse = {
      company_number: profile.company_number ?? companyNumber,
      sic_codes: sicCodes,
      sector_intensity_band: intensity.band,
      sector_intensity_value: intensity.value,
      sector_intensity_sic_code: intensity.matched_code ?? null,
      sector_description: intensity.description ?? null,
      sbti: sbtiMatch,
      sources,
      cached,
    };
    sendJson(response, 200, payload);
  } catch (error) {
    console.error("[EmployerSignals] Profile lookup failed", error);
    sendJson(response, 502, { error: "Failed to fetch employer profile" });
  }
}

type RouteHandler = (
  url: URL,
  response: import("node:http").ServerResponse,
) => Promise<void>;

const routeHandlers: Record<string, RouteHandler> = {
  "/api/jobs/search": handleJobsSearch,
  "/api/employer/resolve": handleEmployerResolve,
  "/api/employer/signals": handleEmployerSignals,
};

async function handleRequest(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  config: ProxyServerConfig,
  providerRateLimiter: ReturnType<typeof createRateLimiter>,
): Promise<void> {
  const requestUrl = request.url ?? "/";
  const url = new URL(requestUrl, "http://localhost");
  const rawOrigin = request.headers.origin;
  const requestOrigin = typeof rawOrigin === "string" ? rawOrigin : undefined;

  if (request.method === "OPTIONS") {
    if (url.pathname === "/api/widget/score") {
      sendJson(response, 403, {
        error: "Browser requests must use a same-origin partner endpoint",
      });
      return;
    }

    if (!isAllowedProxyOrigin(requestOrigin, config.allowedOrigins)) {
      sendJson(response, 403, { error: "Origin is not allowed" });
      return;
    }
    setSearchCorsHeaders(response, requestOrigin);
    sendEmpty(response, 204);
    return;
  }

  if (url.pathname === "/api/widget/score") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    if (!isJsonContentType(request.headers["content-type"])) {
      sendJson(response, 415, { error: "Content-Type must be application/json" });
      return;
    }

    let payload: unknown;
    try {
      payload = await readJsonBody(request);
    } catch (error) {
      if (error instanceof RequestBodyError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      throw error;
    }

    const validation = validateWidgetScoreRequest(payload);
    if (!validation.ok) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    const rawApiKey = request.headers["x-api-key"];
    const apiKey = typeof rawApiKey === "string" ? rawApiKey : null;
    const result = widgetService.handleScoreRequest(validation.value, {
      apiKey,
      origin: request.headers.origin ?? null,
      ip: request.socket.remoteAddress ?? null,
    });
    sendJson(response, result.status, result.body, result.headers ?? {});
    return;
  }

  if (!isAllowedProxyOrigin(requestOrigin, config.allowedOrigins)) {
    sendJson(response, 403, { error: "Origin is not allowed" });
    return;
  }
  setSearchCorsHeaders(response, requestOrigin);
  const handler = routeHandlers[url.pathname];
  if (!handler) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const clientKey = request.socket.remoteAddress ?? "unknown";
  const rate = providerRateLimiter(clientKey);
  if (!rate.allowed) {
    sendJson(response, 429, {
      error: "Rate limit exceeded",
      retry_after_ms: rate.retryAfterMs,
    });
    return;
  }

  await handler(url, response);
}

export function createProxyServer(config: ProxyServerConfig = proxyServerConfig) {
  const providerRateLimiter = createRateLimiter(config.providerRateLimit);
  const server = createServer((request, response) => {
    void handleRequest(request, response, config, providerRateLimiter).catch((error) => {
      console.error("[AdzunaProxy] Unhandled request failure", error);
      if (!response.headersSent) {
        sendJson(response, 500, { error: "Internal server error" });
        return;
      }
      response.destroy();
    });
  });

  server.on("error", (error) => {
    console.error("[AdzunaProxy] Server error", error);
  });
  server.requestTimeout = config.httpTimeouts.requestMs;
  server.headersTimeout = config.httpTimeouts.headersMs;
  server.keepAliveTimeout = config.httpTimeouts.keepAliveMs;
  return server;
}

if (process.env.NODE_ENV !== "test") {
  const server = createProxyServer();
  server.listen(proxyServerConfig.port, proxyServerConfig.host, () => {
    console.log(
      `[AdzunaProxy] Listening on http://${proxyServerConfig.host}:${proxyServerConfig.port}`,
    );
  });
}
