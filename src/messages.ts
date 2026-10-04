import type { GeocodeResult, ScoreResult } from "./scoring/types";
import type { ProxyJob, ScoredJob } from "./search/types";
import type { Settings } from "./storage/settings";

export type ScoreRequestMessage = {
  type: "score_request";
  requestId: string;
  locationName: string;
  settings: Settings;
};

export type ScoreResponseMessage = {
  type: "score_response";
  requestId: string;
  result: ScoreResult;
};

export type SearchScoreRequestMessage = {
  type: "search_score_request";
  requestId: string;
  jobs: ProxyJob[];
  settings: Settings;
  home: GeocodeResult | null;
  remoteOverride: boolean;
};

export type SearchScoreResponseMessage = {
  type: "search_score_response";
  requestId: string;
  results?: ScoredJob[];
  error?: string;
};

export type EmployerResolveRequestMessage = {
  type: "employer_resolve_request";
  name: string;
  hintLocation?: string;
};

export type EmployerSignalsRequestMessage = {
  type: "employer_signals_request";
  companyNumber: string;
  companyName?: string;
};

export type EmployerResponseMessage = {
  type: "employer_response";
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
};

export const LOCAL_PROXY_ORIGIN = "http://localhost:8787";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isSettings(value: unknown): value is Settings {
  return (
    isRecord(value) &&
    isBoundedString(value.homePostcode, 16) &&
    (value.commuteMode === "car" ||
      value.commuteMode === "bus" ||
      value.commuteMode === "rail" ||
      value.commuteMode === "walk" ||
      value.commuteMode === "cycle") &&
    typeof value.officeDaysPerWeek === "number" &&
    Number.isInteger(value.officeDaysPerWeek) &&
    value.officeDaysPerWeek >= 0 &&
    value.officeDaysPerWeek <= 5
  );
}

function isNullableCoordinate(value: unknown, limit: number): value is number | null {
  return value === null ||
    (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit);
}

function isProxyJob(value: unknown): value is ProxyJob {
  return (
    isRecord(value) &&
    isBoundedString(value.id, 300) &&
    isBoundedString(value.title, 300) &&
    isBoundedString(value.company, 300) &&
    isBoundedString(value.redirect_url, 2_048) &&
    isBoundedString(value.created, 100) &&
    isBoundedString(value.description_snippet, 5_000) &&
    isBoundedString(value.location_name, 500) &&
    isNullableCoordinate(value.lat, 90) &&
    isNullableCoordinate(value.lon, 180)
  );
}

function isGeocodeResult(value: unknown): value is GeocodeResult {
  return (
    isRecord(value) &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180
  );
}

export function isScoreRequestMessage(value: unknown): value is ScoreRequestMessage {
  return (
    isRecord(value) &&
    value.type === "score_request" &&
    isBoundedString(value.requestId, 128) &&
    isBoundedString(value.locationName, 500) &&
    isSettings(value.settings)
  );
}

export function isSearchScoreRequestMessage(
  value: unknown,
): value is SearchScoreRequestMessage {
  return (
    isRecord(value) &&
    value.type === "search_score_request" &&
    isBoundedString(value.requestId, 128) &&
    Array.isArray(value.jobs) &&
    value.jobs.length <= 250 &&
    value.jobs.every(isProxyJob) &&
    isSettings(value.settings) &&
    (value.home === null || isGeocodeResult(value.home)) &&
    typeof value.remoteOverride === "boolean"
  );
}

export function isEmployerResolveRequestMessage(
  value: unknown,
): value is EmployerResolveRequestMessage {
  return (
    isRecord(value) &&
    value.type === "employer_resolve_request" &&
    isBoundedString(value.name, 300) &&
    (value.hintLocation === undefined || isBoundedString(value.hintLocation, 500))
  );
}

export function isEmployerSignalsRequestMessage(
  value: unknown,
): value is EmployerSignalsRequestMessage {
  return (
    isRecord(value) &&
    value.type === "employer_signals_request" &&
    isBoundedString(value.companyNumber, 32) &&
    (value.companyName === undefined || isBoundedString(value.companyName, 300))
  );
}

export function isTrustedExtensionSender(
  sender: { id?: string },
  extensionId?: string,
): boolean {
  const expectedId = extensionId ??
    (typeof chrome !== "undefined" ? chrome.runtime?.id : undefined);
  return Boolean(expectedId && sender.id === expectedId);
}
