import { ScoreResult } from "./scoring/types";
import { Settings } from "./storage/settings";

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

export function isScoreRequestMessage(value: unknown): value is ScoreRequestMessage {
  return (
    isRecord(value) &&
    value.type === "score_request" &&
    isBoundedString(value.requestId, 128) &&
    isBoundedString(value.locationName, 500) &&
    isRecord(value.settings)
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
