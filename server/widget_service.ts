import { createHash, timingSafeEqual } from "node:crypto";
import { classifyLocation } from "../src/geo/location_classifier";
import { resolvePlaceFromLocationTokens } from "../src/geo/place_resolver";
import { buildScore } from "../src/scoring/calculator";
import { ScoreBreakdown } from "../src/scoring/types";
import { CommuteMode, Settings } from "../src/storage/settings";
import { createLruCache } from "./cache";
import { createRateLimiter, RateLimitConfig } from "./rate_limit";

export type WidgetScoreRequest = {
  title?: string;
  employer?: string;
  locationName?: string;
  lat?: number;
  lon?: number;
  remoteFlag?: boolean;
  jobUrl?: string;
};

export type WidgetScoreRequestValidation =
  | { ok: true; value: WidgetScoreRequest }
  | { ok: false; error: string };

export type WidgetScoreResponse = {
  badgeText: string;
  status: "ok" | "wfh" | "no_data" | "error";
  score?: number;
  breakdown?: ScoreBreakdown;
  reason?: string;
  employerSignals?: unknown;
};

export type WidgetPartnerConfig = {
  key: string;
  name: string;
  origins: string[];
  rateLimit?: RateLimitConfig;
  cacheTtlDays?: number;
};

export type WidgetServiceConfig = {
  partners: WidgetPartnerConfig[];
  cacheMax?: number;
  defaultHome?: { lat: number; lon: number };
  defaultCommuteMode?: CommuteMode;
  defaultOfficeDays?: number;
  defaultRateLimit?: RateLimitConfig;
};

export type WidgetServiceContext = {
  apiKey?: string | null;
  origin?: string | null;
  ip?: string | null;
};

export type WidgetServiceResponse = {
  status: number;
  body: WidgetScoreResponse | { error: string };
  headers?: Record<string, string>;
};

export type WidgetServiceDependencies = {
  now?: () => number;
  scoreJob?: (
    request: WidgetScoreRequest,
    defaults: WidgetScoreDefaults,
  ) => WidgetScoreResponse;
};

type WidgetScoreDefaults = {
  home: { lat: number; lon: number };
  commuteMode: CommuteMode;
  officeDaysPerWeek: number;
};

type UsageStats = {
  count: number;
  lastRequestAt: number;
};

const DEFAULT_HOME = { lat: 51.5074, lon: -0.1278 };
const DEFAULT_COMMUTE_MODE: CommuteMode = "car";
const DEFAULT_OFFICE_DAYS = 3;
const DEFAULT_CACHE_DAYS = 3;
const DEFAULT_RATE_LIMIT: RateLimitConfig = { windowMs: 60_000, max: 60 };
const MAX_TEXT_LENGTHS = {
  title: 300,
  employer: 300,
  locationName: 500,
  jobUrl: 2_048,
} as const;
const WIDGET_REQUEST_FIELDS = new Set([
  "title",
  "employer",
  "locationName",
  "lat",
  "lon",
  "remoteFlag",
  "jobUrl",
]);

function normalizeText(value: string | null | undefined): string {
  return value ? value.trim() : "";
}

function secretsEqual(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

function isJobUrlAllowed(jobUrl: string | undefined, partner: WidgetPartnerConfig): boolean {
  if (!jobUrl || partner.origins.includes("*")) {
    return true;
  }
  if (partner.origins.length === 0) {
    return false;
  }
  try {
    return partner.origins.includes(new URL(jobUrl).origin);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalText(
  value: unknown,
  field: keyof typeof MAX_TEXT_LENGTHS,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }
  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a string` };
  }
  const normalized = value.trim();
  if (normalized.length > MAX_TEXT_LENGTHS[field]) {
    return { ok: false, error: `${field} is too long` };
  }
  return { ok: true, value: normalized };
}

function readOptionalCoordinate(
  value: unknown,
  field: "lat" | "lon",
): { ok: true; value?: number } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }
  const limit = field === "lat" ? 90 : 180;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) {
    return { ok: false, error: `${field} must be a finite coordinate` };
  }
  return { ok: true, value };
}

export function validateWidgetScoreRequest(value: unknown): WidgetScoreRequestValidation {
  if (!isRecord(value)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const unknownField = Object.keys(value).find((field) => !WIDGET_REQUEST_FIELDS.has(field));
  if (unknownField) {
    return { ok: false, error: `Unknown field: ${unknownField}` };
  }

  const title = readOptionalText(value.title, "title");
  const employer = readOptionalText(value.employer, "employer");
  const locationName = readOptionalText(value.locationName, "locationName");
  const jobUrl = readOptionalText(value.jobUrl, "jobUrl");
  const lat = readOptionalCoordinate(value.lat, "lat");
  const lon = readOptionalCoordinate(value.lon, "lon");
  if (!title.ok) return title;
  if (!employer.ok) return employer;
  if (!locationName.ok) return locationName;
  if (!jobUrl.ok) return jobUrl;
  if (!lat.ok) return lat;
  if (!lon.ok) return lon;

  if (value.remoteFlag !== undefined && typeof value.remoteFlag !== "boolean") {
    return { ok: false, error: "remoteFlag must be a boolean" };
  }
  if ((lat.value === undefined) !== (lon.value === undefined)) {
    return { ok: false, error: "lat and lon must be provided together" };
  }
  if (jobUrl.value) {
    try {
      const parsed = new URL(jobUrl.value);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, error: "jobUrl must use http or https" };
      }
    } catch {
      return { ok: false, error: "jobUrl must be an absolute URL" };
    }
  }

  return {
    ok: true,
    value: {
      title: title.value,
      employer: employer.value,
      locationName: locationName.value,
      lat: lat.value,
      lon: lon.value,
      remoteFlag: value.remoteFlag as boolean | undefined,
      jobUrl: jobUrl.value,
    },
  };
}

function clampCacheDays(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_CACHE_DAYS;
  }
  return Math.min(7, Math.max(1, Math.round(value)));
}

function formatBadgeText(status: WidgetScoreResponse["status"], score?: number): string {
  if (status === "wfh") {
    return "0 kgCO2e/yr";
  }
  if (status === "no_data") {
    return "No data";
  }
  if (status === "error") {
    return "Error";
  }
  if (typeof score === "number") {
    return `${Math.round(score)} kgCO2e/yr`;
  }
  return "Loading...";
}

function buildZeroBreakdown(defaults: WidgetScoreDefaults): ScoreBreakdown {
  return {
    distanceKm: 0,
    officeDaysPerWeek: defaults.officeDaysPerWeek,
    annualKm: 0,
    emissionFactorKgPerKm: 0,
    annualKgCO2e: 0,
  };
}

function resolveLocation(request: WidgetScoreRequest):
  | { kind: "wfh"; reason: string }
  | { kind: "no_data"; reason: string }
  | { kind: "resolved"; lat: number; lon: number; placeName: string } {
  if (request.remoteFlag) {
    return { kind: "wfh", reason: "Remote role" };
  }

  const lat = request.lat;
  const lon = request.lon;
  if (typeof lat === "number" && typeof lon === "number") {
    return {
      kind: "resolved",
      lat,
      lon,
      placeName: normalizeText(request.locationName) || "Location",
    };
  }

  const locationName = normalizeText(request.locationName);
  if (!locationName) {
    return { kind: "no_data", reason: "Missing location" };
  }

  const classification = classifyLocation(locationName);
  if (classification.kind === "wfh") {
    return { kind: "wfh", reason: "Remote role" };
  }

  if (classification.kind === "no_data") {
    return { kind: "no_data", reason: classification.reason };
  }

  const resolved = resolvePlaceFromLocationTokens(classification.tokens);
  if (resolved.kind === "unresolved") {
    return { kind: "no_data", reason: "Cannot resolve place" };
  }

  return {
    kind: "resolved",
    lat: resolved.lat,
    lon: resolved.lon,
    placeName: resolved.chosenName,
  };
}

function scoreRequest(
  request: WidgetScoreRequest,
  defaults: WidgetScoreDefaults,
): WidgetScoreResponse {
  const resolved = resolveLocation(request);
  if (resolved.kind === "wfh") {
    return {
      status: "wfh",
      badgeText: formatBadgeText("wfh"),
      score: 0,
      breakdown: buildZeroBreakdown(defaults),
      reason: resolved.reason,
    };
  }

  if (resolved.kind === "no_data") {
    return {
      status: "no_data",
      badgeText: formatBadgeText("no_data"),
      reason: resolved.reason,
    };
  }

  const settings: Settings = {
    homePostcode: "",
    commuteMode: defaults.commuteMode,
    officeDaysPerWeek: defaults.officeDaysPerWeek,
  };

  const breakdown = buildScore(settings, {
    latitude: defaults.home.lat,
    longitude: defaults.home.lon,
  }, {
    latitude: resolved.lat,
    longitude: resolved.lon,
  });
  const score = Math.round(breakdown.annualKgCO2e);

  return {
    status: "ok",
    badgeText: formatBadgeText("ok", score),
    score,
    breakdown,
  };
}

function buildCacheKey(request: WidgetScoreRequest): string {
  const seed = JSON.stringify({
    title: normalizeText(request.title),
    employer: normalizeText(request.employer),
    locationName: normalizeText(request.locationName),
    lat: request.lat,
    lon: request.lon,
    remoteFlag: Boolean(request.remoteFlag),
    jobUrl: normalizeText(request.jobUrl),
  });
  return createHash("sha256").update(seed).digest("hex");
}

function buildDefaults(config: WidgetServiceConfig): WidgetScoreDefaults {
  return {
    home: config.defaultHome ?? DEFAULT_HOME,
    commuteMode: config.defaultCommuteMode ?? DEFAULT_COMMUTE_MODE,
    officeDaysPerWeek: config.defaultOfficeDays ?? DEFAULT_OFFICE_DAYS,
  };
}

export function parseWidgetPartners(raw: string | undefined): WidgetPartnerConfig[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    const partners: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    return partners
      .filter(isRecord)
      .map((partner) => {
        const origins = Array.isArray(partner.origins)
          ? partner.origins.filter((origin): origin is string => typeof origin === "string")
          : [];
        return {
          key: typeof partner.key === "string" ? partner.key : "",
          name: typeof partner.name === "string" ? partner.name : "",
          origins,
          rateLimit: isRecord(partner.rateLimit)
            ? {
                windowMs: Number(partner.rateLimit.windowMs),
                max: Number(partner.rateLimit.max),
                maxBuckets:
                  partner.rateLimit.maxBuckets === undefined
                    ? undefined
                    : Number(partner.rateLimit.maxBuckets),
              }
            : undefined,
          cacheTtlDays:
            typeof partner.cacheTtlDays === "number" ? partner.cacheTtlDays : undefined,
        };
      })
      .filter((partner) => Boolean(partner.key));
  } catch {
    return [];
  }
}

export function createWidgetService(
  config: WidgetServiceConfig,
  deps: WidgetServiceDependencies = {},
) {
  const defaults = buildDefaults(config);
  const now = deps.now ?? (() => Date.now());
  const usage = new Map<string, UsageStats>();

  const partnerMap = new Map(
    config.partners.map((partner) => [partner.key, partner]),
  );
  const rateLimiters = new Map<string, ReturnType<typeof createRateLimiter>>();
  const caches = new Map<string, ReturnType<typeof createLruCache<WidgetScoreResponse>>>();

  function getPartner(key: string | null | undefined): WidgetPartnerConfig | null {
    if (!key) {
      return null;
    }
    for (const [expectedKey, partner] of partnerMap) {
      if (secretsEqual(key, expectedKey)) {
        return partner;
      }
    }
    return null;
  }

  function getCache(partner: WidgetPartnerConfig) {
    const existing = caches.get(partner.key);
    if (existing) {
      return existing;
    }
    const ttlDays = clampCacheDays(partner.cacheTtlDays);
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    const cache = createLruCache<WidgetScoreResponse>({
      ttlMs,
      maxSize: config.cacheMax ?? 500,
    });
    caches.set(partner.key, cache);
    return cache;
  }

  function getRateLimiter(partner: WidgetPartnerConfig) {
    const existing = rateLimiters.get(partner.key);
    if (existing) {
      return existing;
    }
    const limiter = createRateLimiter(partner.rateLimit ?? config.defaultRateLimit ?? DEFAULT_RATE_LIMIT);
    rateLimiters.set(partner.key, limiter);
    return limiter;
  }

  function recordUsage(partner: WidgetPartnerConfig) {
    const current = usage.get(partner.key);
    if (!current) {
      usage.set(partner.key, { count: 1, lastRequestAt: now() });
      return;
    }
    usage.set(partner.key, {
      count: current.count + 1,
      lastRequestAt: now(),
    });
  }

  function handleScoreRequest(
    request: WidgetScoreRequest,
    context: WidgetServiceContext,
  ): WidgetServiceResponse {
    if (partnerMap.size === 0) {
      return {
        status: 503,
        body: { error: "Widget API not configured" },
      };
    }

    // Shared partner keys are server-side secrets. Browser requests must use a
    // same-origin partner endpoint that calls this service without Origin.
    if (context.origin !== null && context.origin !== undefined) {
      return {
        status: 403,
        body: { error: "Browser requests must use a same-origin partner endpoint" },
      };
    }

    const partner = getPartner(context.apiKey);
    if (!partner) {
      return {
        status: 401,
        body: { error: "Invalid API key" },
      };
    }

    if (!isJobUrlAllowed(request.jobUrl, partner)) {
      return {
        status: 403,
        body: { error: "Job URL is not allowed for this partner" },
      };
    }

    const limiter = getRateLimiter(partner);
    const key = `${partner.key}:${context.ip ?? "unknown"}`;
    const rate = limiter(key);
    if (!rate.allowed) {
      return {
        status: 429,
        body: { error: "Rate limit exceeded" },
        headers: {
          "Retry-After": Math.ceil((rate.retryAfterMs ?? 0) / 1000).toString(),
        },
      };
    }

    recordUsage(partner);
    const cache = getCache(partner);
    const cacheKey = buildCacheKey(request);
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        status: 200,
        body: cached,
        headers: {
          "X-CarbonRank-Cache": "HIT",
        },
      };
    }

    const scorer = deps.scoreJob ?? scoreRequest;
    const response = scorer(request, defaults);
    cache.set(cacheKey, response);

    return {
      status: 200,
      body: response,
      headers: {
        "X-CarbonRank-Cache": "MISS",
      },
    };
  }

  function getUsageStats(): Map<string, UsageStats> {
    return new Map(usage);
  }

  return {
    handleScoreRequest,
    getUsageStats,
  };
}
