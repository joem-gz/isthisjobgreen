import {
  extractJobPostingJsonLd,
  formatJobLocation,
  isRemoteJobPosting,
  JobPostingExtract,
} from "../../extractors/jobposting_jsonld";
import {
  extractReedModalJobPosting,
  findReedModal,
} from "../../sites/reed/job_details_modal";
import { scoreLocationViaRuntime } from "../../scoring/runtime";
import { ScoreBreakdown, ScoreResult } from "../../scoring/types";
import { getSettings, Settings } from "../../storage/settings";
import { noopTelemetry, Telemetry } from "../../telemetry";
import { createAttributionLink } from "../../ui/attribution";
import { ensureStyles } from "../../ui/badge";
import { APP_NAME } from "../../ui/brand";
import { createEmployerSignalsPanel, EmployerSignalsElements } from "../../ui/employer_signals";
import {
  fetchEmployerResolve,
  formatEmployerStatusLabel,
  resolveEmployerSignals,
} from "../../employer/api";
import {
  buildPosterInfo,
  applyAgencySicClassification,
  classifyAgencyFromSicCodes,
  detectAgencyDisclosure,
  extractEmployerCandidateFromJobPosting,
  extractEmployerCandidateFromText,
  extractPosterName,
} from "../../employer/agency";
import {
  EmployerCandidate,
  EmployerResolveResponse,
  EmployerSignalsResult,
  SbtiMatchResult,
} from "../../employer/types";
import {
  clearEmployerOverride,
  EmployerOverride as StoredEmployerOverride,
  getEmployerOverride,
  getEmployerOverrideForPoster,
  setEmployerOverride,
  setEmployerOverrideForPoster,
  clearEmployerOverrideForPoster,
} from "../../storage/employer_overrides";
import pageScoreStyles from "./page_score.css";

const ROOT_ID = "carbonrank-page-score-root";
const STYLE_ID = "carbonrank-page-score-styles";

type PageScoreElements = {
  root: HTMLElement;
  pill: HTMLButtonElement;
  panel: HTMLDivElement;
  closeButton: HTMLButtonElement;
  title: HTMLElement;
  company: HTMLElement;
  location: HTMLElement;
  scoreValue: HTMLElement;
  scoreReason: HTMLElement;
  breakdown: HTMLElement;
  employer: EmployerSignalsElements;
  attribution: HTMLAnchorElement;
};

export type PageScoreDependencies = {
  doc?: Document;
  getSettings?: () => Promise<Settings>;
  scoreLocation?: (locationName: string, settings: Settings) => Promise<ScoreResult>;
  telemetry?: Telemetry;
  fetchEmployerSignals?: (
    name: string,
    hintLocation: string,
    override?: StoredEmployerOverride | null,
  ) => Promise<EmployerSignalsResult>;
  fetchEmployerResolve?: (
    name: string,
    hintLocation: string,
  ) => Promise<EmployerResolveResponse>;
  getEmployerOverride?: (name: string) => Promise<StoredEmployerOverride | null>;
  setEmployerOverride?: (name: string, override: StoredEmployerOverride) => Promise<void>;
  clearEmployerOverride?: (name: string) => Promise<void>;
  getEmployerOverrideForPoster?: (
    posterName: string,
    siteDomain: string,
    jobId?: string,
  ) => Promise<StoredEmployerOverride | null>;
  setEmployerOverrideForPoster?: (
    posterName: string,
    siteDomain: string,
    override: StoredEmployerOverride,
    jobId?: string,
  ) => Promise<void>;
  clearEmployerOverrideForPoster?: (
    posterName: string,
    siteDomain: string,
    jobId?: string,
  ) => Promise<void>;
};

type JobPostingContext = {
  jobPosting: JobPostingExtract;
  locationText: string;
  isRemote: boolean;
  posterScope: (ParentNode & Node) | null;
};

function createElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  el.className = className;
  if (text) {
    el.textContent = text;
  }
  return el;
}

function ensurePageScoreElements(doc: Document): PageScoreElements {
  const existing = doc.getElementById(ROOT_ID);
  if (existing) {
    const panel = existing.querySelector(
      ".carbonrank-page-score__panel",
    ) as HTMLDivElement;
    let attribution = existing.querySelector(
      ".carbonrank-page-score__attribution",
    ) as HTMLAnchorElement | null;
    if (!attribution) {
      const footer = createElement(doc, "div", "carbonrank-page-score__footer");
      attribution = createAttributionLink(doc, {
        className: "carbonrank-page-score__attribution",
      });
      footer.append(attribution);
      panel.append(footer);
    }
    const employerRoot = existing.querySelector(
      ".carbonrank-page-score__employer",
    ) as HTMLDivElement;
    let employer = {} as EmployerSignalsElements;
    if (!employerRoot.querySelector(".carbonrank-page-score__value")) {
      employer = createEmployerSignalsPanel(doc);
      employerRoot.replaceWith(employer.root);
    } else {
      employer = {
        root: employerRoot,
        status: employerRoot.querySelector(
          ".carbonrank-page-score__employer-status",
        ) as HTMLParagraphElement,
        advertiser: employerRoot.querySelector(
          ".carbonrank-page-score__employer-advertiser",
        ) as HTMLParagraphElement,
        matchName: employerRoot.querySelector(
          ".carbonrank-page-score__employer-name",
        ) as HTMLSpanElement,
        matchConfidence: employerRoot.querySelector(
          ".carbonrank-page-score__employer-confidence",
        ) as HTMLSpanElement,
        changeButton: employerRoot.querySelector(
          ".carbonrank-page-score__employer-change",
        ) as HTMLButtonElement,
        select: employerRoot.querySelector(
          ".carbonrank-page-score__employer-select",
        ) as HTMLSelectElement,
        sicCodes: employerRoot.querySelector(
          ".carbonrank-page-score__employer-sic",
        ) as HTMLParagraphElement,
        sicValue: employerRoot.querySelector(
          ".carbonrank-page-score__employer-sic .carbonrank-page-score__value",
        ) as HTMLSpanElement,
        intensity: employerRoot.querySelector(
          ".carbonrank-page-score__employer-intensity",
        ) as HTMLParagraphElement,
        intensityValue: employerRoot.querySelector(
          ".carbonrank-page-score__employer-intensity .carbonrank-page-score__value",
        ) as HTMLSpanElement,
        note: employerRoot.querySelector(
          ".carbonrank-page-score__employer-note",
        ) as HTMLParagraphElement,
        sbtiBadge: employerRoot.querySelector(
          ".carbonrank-page-score__employer-sbti-badge",
        ) as HTMLSpanElement,
        sbtiDetails: employerRoot.querySelector(
          ".carbonrank-page-score__employer-sbti-details",
        ) as HTMLDivElement,
        sbtiNote: employerRoot.querySelector(
          ".carbonrank-page-score__employer-sbti-note",
        ) as HTMLParagraphElement,
      };
    }
    return {
      root: existing,
      pill: existing.querySelector(".carbonrank-page-score__pill") as HTMLButtonElement,
      panel,
      closeButton: existing.querySelector(
        ".carbonrank-page-score__close",
      ) as HTMLButtonElement,
      title: existing.querySelector(".carbonrank-page-score__job-title") as HTMLElement,
      company: existing.querySelector(".carbonrank-page-score__job-company") as HTMLElement,
      location: existing.querySelector(".carbonrank-page-score__job-location") as HTMLElement,
      scoreValue: existing.querySelector(
        ".carbonrank-page-score__score-value",
      ) as HTMLElement,
      scoreReason: existing.querySelector(
        ".carbonrank-page-score__score-reason",
      ) as HTMLElement,
      breakdown: existing.querySelector(
        ".carbonrank-page-score__breakdown",
      ) as HTMLElement,
      employer,
      attribution,
    };
  }

  const root = doc.createElement("div");
  root.id = ROOT_ID;
  root.className = "carbonrank-page-score";

  const pill = createElement(doc, "button", "carbonrank-page-score__pill", APP_NAME);
  pill.type = "button";
  pill.setAttribute("aria-expanded", "false");

  const panel = createElement(doc, "div", "carbonrank-page-score__panel");
  panel.hidden = true;

  const header = createElement(doc, "div", "carbonrank-page-score__header");
  const heading = createElement(doc, "span", "carbonrank-page-score__heading", APP_NAME);
  const closeButton = createElement(doc, "button", "carbonrank-page-score__close", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close");
  header.append(heading, closeButton);

  const body = createElement(doc, "div", "carbonrank-page-score__body");
  const title = createElement(doc, "p", "carbonrank-page-score__job-title");
  const company = createElement(doc, "p", "carbonrank-page-score__job-meta carbonrank-page-score__job-company");
  const location = createElement(doc, "p", "carbonrank-page-score__job-meta carbonrank-page-score__job-location");

  const scoreValue = createElement(doc, "p", "carbonrank-page-score__score-value");
  const scoreReason = createElement(doc, "p", "carbonrank-page-score__score-reason");
  const breakdown = createElement(doc, "div", "carbonrank-page-score__breakdown");
  const employer = createEmployerSignalsPanel(doc);
  const footer = createElement(doc, "div", "carbonrank-page-score__footer");
  const attribution = createAttributionLink(doc, {
    className: "carbonrank-page-score__attribution",
  });
  footer.append(attribution);

  body.append(title, company, location, scoreValue, scoreReason, breakdown, employer.root);
  panel.append(header, body, footer);
  root.append(pill, panel);

  const target = doc.body ?? doc.documentElement;
  target.appendChild(root);

  return {
    root,
    pill,
    panel,
    closeButton,
    title,
    company,
    location,
    scoreValue,
    scoreReason,
    breakdown,
    employer,
    attribution,
  };
}

function formatBreakdown(breakdown: ScoreBreakdown, placeName?: string): string {
  const rows = [
    placeName ? `place: ${placeName}` : null,
    `distance_km: ${breakdown.distanceKm.toFixed(1)}`,
    `office_days_per_week: ${breakdown.officeDaysPerWeek}`,
    `annual_km: ${Math.round(breakdown.annualKm)}`,
    `emission_factor: ${breakdown.emissionFactorKgPerKm.toFixed(3)} kgCO2e/km`,
    `annual_kgco2e: ${Math.round(breakdown.annualKgCO2e)}`,
    "Estimate uses straight-line distance.",
  ].filter(Boolean) as string[];

  return rows.join("\n");
}

function formatEmployerStatusText(result: EmployerSignalsResult): string {
  return `Employer signals: ${formatEmployerStatusLabel(result.status)}`;
}

function formatEmployerConfidence(result: EmployerSignalsResult): string {
  if (result.overrideApplied) {
    return "Confidence: user-selected";
  }
  switch (result.status) {
    case "available":
      return "Confidence: high";
    case "low_confidence":
      return "Confidence: low";
    case "no_data":
      return "Confidence: unavailable";
    case "error":
      return "Confidence: unavailable";
  }
}

function formatBandLabel(band: string): string {
  if (!band || band === "unknown") {
    return "Unknown";
  }
  return band.charAt(0).toUpperCase() + band.slice(1);
}

function formatSicCodes(
  codes: string[],
  description?: string | null,
  matchedCode?: string | null,
): string {
  if (description) {
    const codeLabel = matchedCode || codes[0];
    if (codeLabel) {
      return `${codeLabel} — ${description}`;
    }
    return description;
  }
  return codes.length > 0 ? codes.join(", ") : "Not listed";
}

type SbtiBadgeTone = "positive" | "neutral" | "warning" | "muted";

const SBTI_BADGE_CLASSES = ["is-positive", "is-neutral", "is-warning", "is-muted"];

function setSbtiBadge(
  badge: HTMLSpanElement,
  label: string,
  tone: SbtiBadgeTone,
): void {
  badge.textContent = label;
  badge.classList.remove(...SBTI_BADGE_CLASSES);
  badge.classList.add(`is-${tone}`);
}

function setSbtiDetails(container: HTMLDivElement, lines: string[]): void {
  container.innerHTML = "";
  if (lines.length === 0) {
    container.hidden = true;
    return;
  }
  const doc = container.ownerDocument;
  for (const line of lines) {
    const item = doc.createElement("p");
    item.textContent = line;
    container.appendChild(item);
  }
  container.hidden = false;
}

function pickSbtiStatusBadge(sbti: SbtiMatchResult): { label: string; tone: SbtiBadgeTone } {
  const statuses = [sbti.near_term_status, sbti.net_zero_status].filter(Boolean);
  if (statuses.includes("Targets set")) {
    return { label: "Targets set", tone: "positive" };
  }
  if (statuses.includes("Committed")) {
    return { label: "Committed", tone: "neutral" };
  }
  if (statuses.includes("Commitment removed")) {
    return { label: "Commitment removed", tone: "warning" };
  }
  return { label: "SBTi record found", tone: "neutral" };
}

function buildSbtiDetails(sbti: SbtiMatchResult): string[] {
  const lines: string[] = [];
  if (sbti.matched_company_name) {
    lines.push(`Matched: ${sbti.matched_company_name}`);
  }
  const nearTerm = [
    sbti.near_term_status,
    sbti.near_term_target_classification,
    sbti.near_term_target_year,
  ].filter(Boolean) as string[];
  if (nearTerm.length) {
    lines.push(`Near-term: ${nearTerm.join(" • ")}`);
  }
  const netZero = [sbti.net_zero_status, sbti.net_zero_year].filter(Boolean) as string[];
  if (netZero.length) {
    lines.push(`Net-zero: ${netZero.join(" • ")}`);
  }
  if (sbti.ba15_status) {
    const label =
      sbti.ba15_status === "BA1.5 member"
        ? "Business Ambition for 1.5°C member"
        : sbti.ba15_status;
    lines.push(`BA1.5: ${label}`);
  }
  if (sbti.date_updated) {
    lines.push(`Last updated: ${sbti.date_updated}`);
  }
  lines.push("Source: SBTi public dataset (snapshot). Not a measure of actual emissions.");
  return lines;
}

function renderSbti(
  elements: EmployerSignalsElements,
  sbti: SbtiMatchResult | null | undefined,
  hasCandidate: boolean,
): void {
  if (!hasCandidate || !sbti) {
    setSbtiBadge(elements.sbtiBadge, "Unavailable", "muted");
    setSbtiDetails(elements.sbtiDetails, []);
    return;
  }

  if (sbti.match_status === "low_confidence") {
    setSbtiBadge(elements.sbtiBadge, "Possible match (low confidence)", "neutral");
    const details = [];
    if (sbti.matched_company_name) {
      details.push(`Matched: ${sbti.matched_company_name}`);
    }
    details.push("Confirm the employer match to view SBTi details.");
    setSbtiDetails(elements.sbtiDetails, details);
    return;
  }

  if (sbti.match_status === "no_match") {
    setSbtiBadge(elements.sbtiBadge, "No public SBTi record found", "muted");
    setSbtiDetails(elements.sbtiDetails, []);
    return;
  }

  const badge = pickSbtiStatusBadge(sbti);
  setSbtiBadge(elements.sbtiBadge, badge.label, badge.tone);
  setSbtiDetails(elements.sbtiDetails, buildSbtiDetails(sbti));
}

function populateEmployerOptions(
  select: HTMLSelectElement,
  candidates: EmployerCandidate[],
  overrideCompanyNumber?: string,
): void {
  select.innerHTML = "";
  const autoOption = new Option("Auto (top match)", "");
  select.append(autoOption);
  for (const candidate of candidates) {
    const label = candidate.address_snippet
      ? `${candidate.title} • ${candidate.address_snippet}`
      : candidate.title;
    const option = new Option(label, candidate.company_number);
    select.append(option);
  }
  select.value = overrideCompanyNumber ?? "";
}

function setSignalValue(target: HTMLSpanElement, value: string): void {
  target.textContent = `: ${value}`;
}

function setEmployerLoading(elements: EmployerSignalsElements): void {
  elements.status.textContent = "Employer signals: loading";
  elements.advertiser.textContent = "";
  elements.matchName.textContent = "Loading…";
  elements.matchConfidence.textContent = "";
  setSignalValue(elements.sicValue, "—");
  setSignalValue(elements.intensityValue, "—");
  setSbtiBadge(elements.sbtiBadge, "—", "muted");
  setSbtiDetails(elements.sbtiDetails, []);
  elements.changeButton.textContent = "Change";
  elements.changeButton.disabled = true;
  elements.select.disabled = true;
  elements.select.hidden = true;
}

function setEmployerEmpty(elements: EmployerSignalsElements, message: string): void {
  elements.status.textContent = "Employer signals: no data";
  elements.advertiser.textContent = "";
  elements.matchName.textContent = message;
  elements.matchConfidence.textContent = "";
  setSignalValue(elements.sicValue, "Not listed");
  setSignalValue(elements.intensityValue, "unavailable");
  setSbtiBadge(elements.sbtiBadge, "Unavailable", "muted");
  setSbtiDetails(elements.sbtiDetails, []);
  elements.changeButton.textContent = "Change";
  elements.changeButton.disabled = true;
  elements.select.disabled = true;
  elements.select.hidden = true;
}

function setEmployerSignalsState(
  elements: EmployerSignalsElements,
  result: EmployerSignalsResult,
  override?: StoredEmployerOverride | null,
): void {
  elements.status.textContent = formatEmployerStatusText(result);
  elements.matchConfidence.textContent = formatEmployerConfidence(result);
  elements.changeButton.textContent = "Change";

  if (result.poster?.isAgency) {
    elements.advertiser.textContent = `Advertiser: ${result.poster.name}`;
  } else {
    elements.advertiser.textContent = "";
  }

  if (result.poster?.isAgency && !result.selectedCandidate) {
    elements.matchName.textContent =
      result.reason ?? "Employer not disclosed (advert posted by recruitment agency)";
    elements.matchConfidence.textContent = "";
    setSignalValue(elements.sicValue, "Not listed");
    setSignalValue(elements.intensityValue, "unavailable");
    renderSbti(elements, null, false);
    elements.changeButton.textContent = "Set employer";
    elements.changeButton.disabled = false;
    elements.select.hidden = true;
    return;
  }

  if (!result.selectedCandidate) {
    elements.matchName.textContent = result.reason ?? "No match";
    setSignalValue(elements.sicValue, "Not listed");
    setSignalValue(elements.intensityValue, "unavailable");
    renderSbti(elements, null, false);
    elements.changeButton.disabled = true;
    elements.select.hidden = true;
    return;
  }

  elements.matchName.textContent = result.selectedCandidate.title || "Unknown";

  const showSignals = result.status === "available" || !result.poster?.isAgency;
  const sicCodes = showSignals
    ? result.signals?.sic_codes ?? result.selectedCandidate.sic_codes ?? []
    : [];
  setSignalValue(
    elements.sicValue,
    formatSicCodes(
      sicCodes,
      showSignals ? result.signals?.sector_description : null,
      showSignals ? result.signals?.sector_intensity_sic_code : null,
    ),
  );

  if (
    showSignals &&
    result.signals?.sector_intensity_value !== null &&
    result.signals?.sector_intensity_value !== undefined
  ) {
    const bandLabel = formatBandLabel(result.signals.sector_intensity_band);
    const value = result.signals.sector_intensity_value.toFixed(2);
    setSignalValue(elements.intensityValue, `${bandLabel} (${value})`);
  } else {
    setSignalValue(elements.intensityValue, "unavailable");
  }

  renderSbti(elements, result.signals?.sbti, true);

  const hasCandidates = result.candidates.length > 0;
  elements.changeButton.disabled = !hasCandidates;
  elements.select.disabled = !hasCandidates;
  if (hasCandidates) {
    populateEmployerOptions(elements.select, result.candidates, override?.companyNumber);
    elements.select.hidden = true;
  } else {
    elements.select.hidden = true;
  }
}

function setPanelState(
  elements: PageScoreElements,
  result: ScoreResult,
  displayLocation: string,
  isRemote: boolean,
): void {
  elements.scoreReason.textContent = "";
  elements.breakdown.textContent = "";

  switch (result.status) {
    case "set_postcode":
      elements.scoreValue.textContent = "Set postcode";
      elements.scoreReason.textContent =
        "Add a home postcode in the extension settings.";
      return;
    case "wfh":
      elements.scoreValue.textContent = "0 kgCO2e/yr";
      elements.scoreReason.textContent = result.reason;
      elements.breakdown.textContent = formatBreakdown(result.breakdown);
      return;
    case "no_data":
      elements.scoreValue.textContent = "No data";
      elements.scoreReason.textContent = result.reason;
      return;
    case "loading":
      elements.scoreValue.textContent = "Loading...";
      elements.scoreReason.textContent = "Calculating commute estimate.";
      return;
    case "ok": {
      const annualKg = Math.round(result.breakdown.annualKgCO2e);
      elements.scoreValue.textContent = `${annualKg} kgCO2e/yr`;
      elements.scoreReason.textContent = isRemote
        ? "Remote role; commute assumed 0."
        : `Location: ${displayLocation || "Not specified"}`;
      elements.breakdown.textContent = formatBreakdown(
        result.breakdown,
        result.placeName,
      );
      return;
    }
    case "error":
      elements.scoreValue.textContent = "Error";
      elements.scoreReason.textContent = result.reason;
      return;
  }
}

function formatJobMeta(value: string, fallback: string): string {
  return value ? value : fallback;
}

function applyJobDetails(
  elements: PageScoreElements,
  jobPosting: JobPostingExtract,
  displayLocation: string,
): void {
  elements.title.textContent = formatJobMeta(jobPosting.title, "Job details");
  elements.company.textContent = formatJobMeta(
    jobPosting.hiringOrganizationName,
    "Company not listed",
  );
  elements.location.textContent = `Location: ${displayLocation || "Not specified"}`;
}

function togglePanel(elements: PageScoreElements, open: boolean): void {
  elements.panel.hidden = !open;
  elements.pill.setAttribute("aria-expanded", String(open));
}

function pickJobPosting(postings: JobPostingExtract[]): JobPostingExtract {
  return (
    postings.find(
      (posting) => posting.title || posting.hiringOrganizationName || posting.jobLocations.length,
    ) ?? postings[0]
  );
}

function buildContextKey(context: JobPostingContext): string {
  const { jobPosting, locationText, isRemote } = context;
  return [
    jobPosting.title,
    jobPosting.hiringOrganizationName,
    locationText,
    isRemote ? "remote" : "onsite",
  ].join("|");
}

function readScopeText(scope: ParentNode & Node, doc: Document): string {
  const container = scope instanceof Element ? scope : doc.body;
  if (!container) {
    return "";
  }
  const clone = container.cloneNode(true) as Element;
  clone
    .querySelectorAll(`#${ROOT_ID}, [data-carbonrank-badge]`)
    .forEach((el) => el.remove());
  return clone.textContent ?? "";
}

function extractJobIdFromUrl(url: URL): string | undefined {
  const matches = url.pathname.match(/\d{5,}/g);
  if (!matches || matches.length === 0) {
    return undefined;
  }
  return matches[matches.length - 1];
}

function resolveJobPostingContext(doc: Document): JobPostingContext | null {
  const modalPosting = extractReedModalJobPosting(doc);
  if (modalPosting) {
    const locationText = formatJobLocation(modalPosting);
    return {
      jobPosting: modalPosting,
      locationText,
      isRemote: false,
      posterScope: findReedModal(doc) ?? doc.body ?? doc,
    };
  }

  const postings = extractJobPostingJsonLd(doc);
  if (postings.length > 0) {
    const jobPosting = pickJobPosting(postings);
    const isRemote = isRemoteJobPosting(jobPosting);
    const locationText = isRemote ? "Remote" : formatJobLocation(jobPosting);
    return { jobPosting, locationText, isRemote, posterScope: doc.body ?? doc };
  }

  return null;
}

export async function initPageScore(deps: PageScoreDependencies = {}): Promise<void> {
  const doc = deps.doc ?? document;
  const telemetry = deps.telemetry ?? noopTelemetry;
  const getSettingsFn = deps.getSettings ?? getSettings;
  const scoreLocationFn = deps.scoreLocation ?? scoreLocationViaRuntime;
  const fetchEmployerSignalsFn =
    deps.fetchEmployerSignals ??
    ((name, hintLocation, override) =>
      resolveEmployerSignals(name, hintLocation, override ?? undefined));
  const fetchEmployerResolveFn =
    deps.fetchEmployerResolve ??
    ((name, hintLocation) => fetchEmployerResolve(name, hintLocation));
  const getEmployerOverrideFn = deps.getEmployerOverride ?? getEmployerOverride;
  const setEmployerOverrideFn = deps.setEmployerOverride ?? setEmployerOverride;
  const clearEmployerOverrideFn = deps.clearEmployerOverride ?? clearEmployerOverride;
  const getEmployerOverrideForPosterFn =
    deps.getEmployerOverrideForPoster ?? getEmployerOverrideForPoster;
  const setEmployerOverrideForPosterFn =
    deps.setEmployerOverrideForPoster ?? setEmployerOverrideForPoster;
  const clearEmployerOverrideForPosterFn =
    deps.clearEmployerOverrideForPoster ?? clearEmployerOverrideForPoster;

  let elements: PageScoreElements | null = null;
  let currentContext: JobPostingContext | null = null;
  let currentKey = "";
  let scoreRequestId = 0;
  let employerRequestId = 0;
  let refreshQueued = false;
  let currentEmployerName = "";
  let currentEmployerSearchName = "";
  let currentEmployerCandidates: EmployerCandidate[] = [];
  let currentPosterContext: { name: string; domain: string; jobId?: string } | null = null;
  let currentPosterIsAgency = false;
  let currentOverrideScope: "employer" | "poster" = "employer";

  const ensureElements = (): PageScoreElements => {
    ensureStyles(pageScoreStyles, doc, STYLE_ID);
    if (!elements) {
      elements = ensurePageScoreElements(doc);
    }
    return elements;
  };

  const runScore = async () => {
    if (!currentContext) {
      return;
    }
    const activeElements = ensureElements();
    const { locationText, isRemote } = currentContext;
    const requestId = ++scoreRequestId;

    setPanelState(activeElements, { status: "loading" }, locationText, isRemote);
    telemetry.trackEvent("page_score_requested", { remote: isRemote });
    const settings = await getSettingsFn();
    const locationName = isRemote ? "Work from home" : locationText;
    const result = await scoreLocationFn(locationName, settings);
    if (requestId !== scoreRequestId) {
      return;
    }
    const finalResult =
      isRemote && result.status === "wfh"
        ? { ...result, reason: "Job posting marked as remote" }
        : result;
    setPanelState(activeElements, finalResult, locationText, isRemote);
  };

  const runEmployerSignals = async () => {
    if (!currentContext) {
      return;
    }
    const employerName = extractPosterName(
      currentContext.posterScope ?? doc,
      currentContext.jobPosting.hiringOrganizationName,
    );
    const hintLocation = currentContext.locationText;
    const requestId = ++employerRequestId;

    const posterText = readScopeText(
      currentContext.posterScope ?? doc,
      doc,
    );

    const activeElements = ensureElements();

    currentEmployerName = employerName;
    currentEmployerSearchName = "";
    currentEmployerCandidates = [];
    currentPosterContext = null;
    currentPosterIsAgency = false;
    currentOverrideScope = "employer";

    if (!employerName) {
      setEmployerEmpty(activeElements.employer, "Employer not listed");
      return;
    }

    setEmployerLoading(activeElements.employer);
    const disclosure = detectAgencyDisclosure(posterText);
    let posterResolve: EmployerResolveResponse | null = null;
    try {
      posterResolve = await fetchEmployerResolveFn(employerName, hintLocation);
    } catch (error) {
      console.warn("[EmployerSignals] Poster resolve failed", error);
      posterResolve = null;
    }

    const posterCandidate = posterResolve?.candidates?.[0];
    let posterInfo = buildPosterInfo(employerName, disclosure, posterCandidate);
    currentPosterIsAgency = posterInfo.isAgency;

    const pageUrl = new URL(doc.URL || window.location.href);
    const jobId = extractJobIdFromUrl(pageUrl);
    currentPosterContext = {
      name: employerName,
      domain: pageUrl.hostname,
      jobId,
    };

    const employerCandidate =
      extractEmployerCandidateFromJobPosting(currentContext.jobPosting, employerName) ??
      extractEmployerCandidateFromText(posterText, employerName);

    let override = posterInfo.isAgency
      ? await getEmployerOverrideForPosterFn(employerName, pageUrl.hostname, jobId)
      : await getEmployerOverrideFn(employerName);
    currentOverrideScope = posterInfo.isAgency ? "poster" : "employer";

    let result: EmployerSignalsResult;
    if (posterInfo.isAgency) {
      if (!employerCandidate && !override) {
        result = {
          status: "no_data",
          candidates: [],
          reason: "Employer not disclosed (advert posted by recruitment agency)",
          poster: posterInfo,
          employerCandidate,
        };
        if (requestId !== employerRequestId) {
          return;
        }
        setEmployerSignalsState(activeElements.employer, result, override);
        return;
      }

      const targetName =
        override?.companyName || employerCandidate?.name || employerName;
      currentEmployerSearchName = targetName;
      try {
        result = await fetchEmployerSignalsFn(targetName, hintLocation, override);
      } catch (error) {
        console.error("[EmployerSignals] Failed to load", error);
        result = {
          status: "error",
          candidates: [],
          reason: "Unable to load employer signals",
        };
      }

      if (result.status !== "available") {
        result.signals = null;
      }
    } else {
      currentEmployerSearchName = employerName;
      try {
        result = await fetchEmployerSignalsFn(employerName, hintLocation, override);
      } catch (error) {
        console.error("[EmployerSignals] Failed to load", error);
        result = {
          status: "error",
          candidates: [],
          reason: "Unable to load employer signals",
        };
      }

      const sicCodes = result.signals?.sic_codes ?? result.selectedCandidate?.sic_codes ?? [];
      if (classifyAgencyFromSicCodes(sicCodes).isAgency) {
        posterInfo = applyAgencySicClassification(posterInfo, sicCodes);
        currentPosterIsAgency = true;
        if (currentOverrideScope !== "poster") {
          override = await getEmployerOverrideForPosterFn(
            employerName,
            pageUrl.hostname,
            jobId,
          );
          currentOverrideScope = "poster";
        }

        if (!employerCandidate && !override) {
          result = {
            status: "no_data",
            candidates: [],
            reason: "Employer not disclosed (advert posted by recruitment agency)",
            poster: posterInfo,
            employerCandidate,
          };
          if (requestId !== employerRequestId) {
            return;
          }
          setEmployerSignalsState(activeElements.employer, result, override);
          return;
        }

        const targetName =
          override?.companyName || employerCandidate?.name || employerName;
        currentEmployerSearchName = targetName;
        try {
          result = await fetchEmployerSignalsFn(targetName, hintLocation, override);
        } catch (error) {
          console.error("[EmployerSignals] Failed to load", error);
          result = {
            status: "error",
            candidates: [],
            reason: "Unable to load employer signals",
          };
        }

        if (result.status !== "available") {
          result.signals = null;
        }
      }
    }

    if (requestId !== employerRequestId) {
      return;
    }

    result.poster = posterInfo;
    result.employerCandidate = employerCandidate;
    currentEmployerCandidates = result.candidates;
    setEmployerSignalsState(activeElements.employer, result, override);
  };

  const refresh = async () => {
    const context = resolveJobPostingContext(doc);
    if (!context) {
      if (elements) {
        togglePanel(elements, false);
        elements.root.hidden = true;
      }
      currentContext = null;
      currentKey = "";
      return;
    }

    const nextKey = buildContextKey(context);
    const activeElements = ensureElements();
    const keyChanged = nextKey !== currentKey || activeElements.root.hidden;

    currentContext = context;
    currentKey = nextKey;
    activeElements.root.hidden = false;

    if (!activeElements.root.dataset.bound) {
      activeElements.root.dataset.bound = "true";
      activeElements.pill.addEventListener("click", () => {
        const open = activeElements.panel.hidden;
        togglePanel(activeElements, open);
        if (open) {
          telemetry.trackEvent("page_score_opened");
        }
      });
      activeElements.closeButton.addEventListener("click", () =>
        togglePanel(activeElements, false),
      );
    }

    if (!activeElements.root.dataset.employerControls) {
      activeElements.root.dataset.employerControls = "true";
      const handleEmployerChange = async () => {
        if (activeElements.employer.changeButton.disabled) {
          return;
        }

        if (currentPosterIsAgency && currentEmployerCandidates.length === 0) {
          if (!window.prompt) {
            return;
          }
          const entered = window.prompt("Enter employer name");
          if (!entered) {
            return;
          }
          const trimmed = entered.trim();
          if (!trimmed) {
            return;
          }
          currentEmployerSearchName = trimmed;
          try {
            const resolved = await fetchEmployerResolveFn(
              trimmed,
              currentContext?.locationText ?? "",
            );
            currentEmployerCandidates = resolved.candidates ?? [];
            populateEmployerOptions(
              activeElements.employer.select,
              currentEmployerCandidates,
            );
            activeElements.employer.select.disabled =
              currentEmployerCandidates.length === 0;
          } catch (error) {
            console.error("[EmployerSignals] Employer lookup failed", error);
            return;
          }
        }

        activeElements.employer.select.hidden =
          !activeElements.employer.select.hidden;
        if (!activeElements.employer.select.hidden) {
          activeElements.employer.select.focus();
        }
      };

      activeElements.employer.changeButton.addEventListener("click", () => {
        void handleEmployerChange();
      });
      activeElements.employer.select.addEventListener("change", async () => {
        if (!currentEmployerName) {
          return;
        }
        const selectedNumber = activeElements.employer.select.value;
        if (currentOverrideScope === "poster" && currentPosterContext) {
          if (!selectedNumber) {
            await clearEmployerOverrideForPosterFn(
              currentPosterContext.name,
              currentPosterContext.domain,
              currentPosterContext.jobId,
            );
          } else {
            const candidate = currentEmployerCandidates.find(
              (item) => item.company_number === selectedNumber,
            );
            await setEmployerOverrideForPosterFn(
              currentPosterContext.name,
              currentPosterContext.domain,
              {
                companyNumber: selectedNumber,
                companyName:
                  candidate?.title || currentEmployerSearchName || currentEmployerName,
                updatedAt: Date.now(),
              },
              currentPosterContext.jobId,
            );
          }
        } else if (!selectedNumber) {
          await clearEmployerOverrideFn(currentEmployerName);
        } else {
          const candidate = currentEmployerCandidates.find(
            (item) => item.company_number === selectedNumber,
          );
          await setEmployerOverrideFn(currentEmployerName, {
            companyNumber: selectedNumber,
            companyName: candidate?.title ?? currentEmployerName,
            updatedAt: Date.now(),
          });
        }
        activeElements.employer.select.hidden = true;
        await runEmployerSignals();
      });
    }

    if (!activeElements.root.dataset.settingsListener) {
      activeElements.root.dataset.settingsListener = "true";
      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === "sync" && changes.carbonrankSettings) {
            void runScore();
            return;
          }
          if (areaName === "local" && changes.carbonrankEmployerOverrides) {
            void runEmployerSignals();
          }
        });
      }
    }

    if (keyChanged) {
      applyJobDetails(activeElements, context.jobPosting, context.locationText);
      await Promise.all([runScore(), runEmployerSignals()]);
    }
  };

  const scheduleRefresh = () => {
    if (refreshQueued) {
      return;
    }
    refreshQueued = true;
    Promise.resolve().then(() => {
      refreshQueued = false;
      void refresh();
    });
  };

  if (doc.documentElement && !doc.documentElement.dataset.pageScoreObserver) {
    doc.documentElement.dataset.pageScoreObserver = "true";
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(scheduleRefresh);
      observer.observe(doc.documentElement, { childList: true, subtree: true });
    }
  }

  await refresh();
}
