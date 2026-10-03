const DEFAULT_BASE_URL = "https://api.company-information.service.gov.uk";

const LEGAL_SUFFIXES = new Set([
  "ltd",
  "limited",
  "holdings",
  "holding",
  "group",
  "groups",
  "plc",
  "llp",
  "lp",
  "inc",
  "incorporated",
  "co",
  "company",
  "corp",
  "corporation",
  "llc",
  "gmbh",
  "sa",
  "sarl",
]);

type CompaniesHouseAddress = {
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  region?: string;
  postal_code?: string;
};

export type CompaniesHouseSearchItem = {
  company_number?: string;
  title?: string;
  company_status?: string;
  address_snippet?: string;
  address?: CompaniesHouseAddress;
  sic_codes?: string[];
};

export type CompaniesHouseSearchResponse = {
  items?: CompaniesHouseSearchItem[];
};

export type CompaniesHouseProfile = {
  company_number?: string;
  company_name?: string;
  company_status?: string;
  sic_codes?: string[];
};

export type CompaniesHouseClientConfig = {
  apiKey: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
};

export type OrgClassification = "employer" | "agency" | "unknown";

export type EmployerCandidate = {
  company_number: string;
  title: string;
  status: string;
  address_snippet: string;
  sic_codes: string[];
  score: number;
  reasons: string[];
  org_classification: OrgClassification;
  classification_reasons: string[];
};

const AGENCY_SIC_CODES = new Set(["78101", "78109", "78200", "78300"]);
const AGENCY_SIC_PREFIX = "78";
const DEFAULT_TIMEOUT_MS = 10_000;

function createDeadline(timeoutMs: number): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

function normalizeSicCode(code: string): string {
  return code.replace(/[^0-9]/g, "");
}

export function classifyOrganisationFromSic(
  sicCodes: string[],
): { org_classification: OrgClassification; classification_reasons: string[] } {
  const normalized = sicCodes.map(normalizeSicCode).filter(Boolean);
  if (normalized.length === 0) {
    return { org_classification: "unknown", classification_reasons: [] };
  }

  const agencyCodes = normalized.filter(
    (code) => code.startsWith(AGENCY_SIC_PREFIX) || AGENCY_SIC_CODES.has(code),
  );
  if (agencyCodes.length > 0) {
    const reasons = Array.from(new Set(agencyCodes.map((code) => `sic_${code}`)));
    return { org_classification: "agency", classification_reasons: reasons };
  }

  return { org_classification: "employer", classification_reasons: [] };
}

export function buildCompaniesHouseAuthHeader(apiKey: string): string {
  const token = Buffer.from(`${apiKey}:`).toString("base64");
  return `Basic ${token}`;
}

export function buildCompaniesHouseSearchUrl(
  query: string,
  baseUrl: string = DEFAULT_BASE_URL,
): string {
  const url = new URL("/search/companies", baseUrl);
  url.searchParams.set("q", query);
  return url.toString();
}

export function buildCompaniesHouseProfileUrl(
  companyNumber: string,
  baseUrl: string = DEFAULT_BASE_URL,
): string {
  const url = new URL(`/company/${companyNumber}`, baseUrl);
  return url.toString();
}

async function fetchCompaniesHouseJson<T>(
  url: string,
  config: CompaniesHouseClientConfig,
): Promise<T> {
  const deadline = createDeadline(config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await (config.fetchFn ?? fetch)(url, {
      headers: {
        Authorization: buildCompaniesHouseAuthHeader(config.apiKey),
        Accept: "application/json",
      },
      signal: deadline.signal,
    });

    if (!response.ok) {
      throw new Error(`Companies House request failed with ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    deadline.cancel();
  }
}

export async function fetchCompaniesHouseSearch(
  query: string,
  config: CompaniesHouseClientConfig,
): Promise<CompaniesHouseSearchResponse> {
  const url = buildCompaniesHouseSearchUrl(query, config.baseUrl ?? DEFAULT_BASE_URL);
  return fetchCompaniesHouseJson<CompaniesHouseSearchResponse>(url, config);
}

export async function fetchCompaniesHouseProfile(
  companyNumber: string,
  config: CompaniesHouseClientConfig,
): Promise<CompaniesHouseProfile> {
  const url = buildCompaniesHouseProfileUrl(
    companyNumber,
    config.baseUrl ?? DEFAULT_BASE_URL,
  );
  return fetchCompaniesHouseJson<CompaniesHouseProfile>(url, config);
}

function normalizeFreeformText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompanyNameStrict(name: string): string {
  return normalizeFreeformText(name);
}

export function normalizeCompanyNameLoose(name: string): string {
  const cleaned = normalizeCompanyNameStrict(name);
  if (!cleaned) {
    return "";
  }

  const tokens = cleaned.split(" ");
  while (tokens.length > 0 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  return tokens.join(" ");
}

export function normalizeCompanyName(name: string): string {
  return normalizeCompanyNameLoose(name);
}

function tokenize(value: string): string[] {
  if (!value) {
    return [];
  }
  return value.split(/\s+/).filter(Boolean);
}

function buildAddressSnippet(item: CompaniesHouseSearchItem): string {
  if (item.address_snippet) {
    return item.address_snippet;
  }

  const address = item.address;
  if (!address) {
    return "";
  }

  const parts = [
    address.address_line_1,
    address.address_line_2,
    address.locality,
    address.region,
    address.postal_code,
  ].filter(Boolean);
  return parts.join(", ");
}

function computeTokenOverlap(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }
  const candidateSet = new Set(candidateTokens);
  let shared = 0;
  for (const token of queryTokens) {
    if (candidateSet.has(token)) {
      shared += 1;
    }
  }
  return shared / Math.max(queryTokens.length, candidateTokens.length);
}

function matchesLocationHint(addressSnippet: string, hintLocation: string): boolean {
  if (!addressSnippet || !hintLocation) {
    return false;
  }
  const address = normalizeFreeformText(addressSnippet);
  const hintTokens = tokenize(normalizeFreeformText(hintLocation)).filter(
    (token) => token.length > 2,
  );
  return hintTokens.some((token) => address.includes(token));
}

export function rankCompanies(
  query: string,
  items: CompaniesHouseSearchItem[],
  hintLocation?: string,
): EmployerCandidate[] {
  const normalizedQuery = normalizeCompanyName(query);
  const queryTokens = tokenize(normalizedQuery);

  return items
    .map((item) => {
      const title = item.title ?? "";
      const normalizedTitle = normalizeCompanyName(title);
      const candidateTokens = tokenize(normalizedTitle);
      const reasons: string[] = [];
      let score = 0;

      if (normalizedQuery && normalizedTitle && normalizedQuery === normalizedTitle) {
        score += 0.65;
        reasons.push("exact_normalized_match");
      }

      const overlap = computeTokenOverlap(queryTokens, candidateTokens);
      if (overlap > 0) {
        score += 0.25 * overlap;
        reasons.push(`token_overlap_${Math.round(overlap * 100)}`);
      }

      const addressSnippet = buildAddressSnippet(item);
      if (hintLocation && matchesLocationHint(addressSnippet, hintLocation)) {
        score += 0.1;
        reasons.push("location_hint_match");
      }

      score = Math.min(1, Number(score.toFixed(3)));

      const sicCodes = Array.isArray(item.sic_codes) ? item.sic_codes.filter(Boolean) : [];
      const classification = classifyOrganisationFromSic(sicCodes);

      return {
        company_number: item.company_number ?? "",
        title,
        status: item.company_status ?? "unknown",
        address_snippet: addressSnippet,
        sic_codes: sicCodes,
        score,
        reasons,
        org_classification: classification.org_classification,
        classification_reasons: classification.classification_reasons,
      };
    })
    .filter((candidate) => Boolean(candidate.company_number))
    .sort((a, b) => b.score - a.score);
}
