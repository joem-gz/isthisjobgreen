import { AdzunaApiResponse, NormalizedJob } from "./types";

export type SearchQuery = {
  q: string;
  where: string;
  page: number;
  radiusKm?: number;
  remoteOnly: boolean;
};

export type AdzunaConfig = {
  appId: string;
  appKey: string;
  country?: string;
  resultsPerPage?: number;
  timeoutMs?: number;
};

const BASE_URL = "https://api.adzuna.com/v1/api/jobs";
const DEFAULT_TIMEOUT_MS = 10_000;

function createDeadline(timeoutMs: number): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

export function buildAdzunaUrl(query: SearchQuery, config: AdzunaConfig): string {
  const country = config.country ?? "gb";
  const page = Math.max(1, Math.round(query.page || 1));
  const url = new URL(`${BASE_URL}/${country}/search/${page}`);
  url.searchParams.set("app_id", config.appId);
  url.searchParams.set("app_key", config.appKey);
  url.searchParams.set(
    "results_per_page",
    String(config.resultsPerPage ?? 20),
  );

  const what = [query.q, query.remoteOnly ? "remote" : ""]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
  if (what) {
    url.searchParams.set("what", what);
  }

  if (query.where.trim()) {
    url.searchParams.set("where", query.where.trim());
  }

  if (typeof query.radiusKm === "number" && query.radiusKm > 0) {
    url.searchParams.set("distance", String(query.radiusKm));
  }

  return url.toString();
}

function resolveCompanyName(job: {
  company?: { display_name?: string; name?: string } | string;
}): string {
  if (!job.company) {
    return "";
  }
  if (typeof job.company === "string") {
    return job.company;
  }
  return job.company.display_name ?? job.company.name ?? "";
}

function resolveLocationName(job: {
  location?: { display_name?: string; area?: string[]; name?: string };
}): string {
  if (!job.location) {
    return "";
  }
  if (job.location.display_name) {
    return job.location.display_name;
  }
  if (Array.isArray(job.location.area) && job.location.area.length > 0) {
    return job.location.area.join(", ");
  }
  return job.location.name ?? "";
}

export function normalizeAdzunaResults(payload: AdzunaApiResponse): NormalizedJob[] {
  const results = Array.isArray(payload.results) ? payload.results : [];
  return results.map((job) => {
    const idValue = job.id ?? job.redirect_url ?? job.url ?? "";
    return {
      id: String(idValue),
      title: job.title ?? "",
      company: resolveCompanyName(job),
      redirect_url: job.redirect_url ?? job.url ?? "",
      created: job.created ?? "",
      description_snippet:
        job.description_snippet ?? job.description ?? "",
      location_name: resolveLocationName(job),
      lat: job.latitude ?? job.location?.latitude ?? null,
      lon: job.longitude ?? job.location?.longitude ?? null,
    };
  });
}

export async function fetchAdzunaJobs(
  query: SearchQuery,
  config: AdzunaConfig,
  fetchFn: typeof fetch = fetch,
): Promise<{ results: NormalizedJob[]; count: number }>
{
  const url = buildAdzunaUrl(query, config);
  const deadline = createDeadline(config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, { signal: deadline.signal });
    if (!response.ok) {
      throw new Error(`Adzuna request failed with ${response.status}`);
    }

    const payload = (await response.json()) as AdzunaApiResponse;
    const results = normalizeAdzunaResults(payload);
    const count = typeof payload.count === "number" ? payload.count : results.length;

    return { results, count };
  } finally {
    deadline.cancel();
  }
}
