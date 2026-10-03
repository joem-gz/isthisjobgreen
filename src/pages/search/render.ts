import { sortJobsByCo2 } from "../../search/sorting";
import { ProxyJob, ScoredJob, SearchQuery } from "../../search/types";
import { ScoreBreakdown, ScoreResult } from "../../scoring/types";
import { SavedSearch } from "../../storage/search";
import { resolveSafeJobUrl } from "../../search/job_links";

function formatBreakdown(breakdown: ScoreBreakdown, placeName: string): string {
  return [
    `place: ${placeName}`,
    `distance_km: ${breakdown.distanceKm.toFixed(1)}`,
    `office_days_per_week: ${breakdown.officeDaysPerWeek}`,
    `annual_km: ${Math.round(breakdown.annualKm)}`,
    `emission_factor: ${breakdown.emissionFactorKgPerKm.toFixed(3)} kgCO2e/km`,
    `annual_kgco2e: ${Math.round(breakdown.annualKgCO2e)}`,
    "Estimate uses straight-line distance.",
  ].join("\n");
}

function formatWfhBreakdown(breakdown: ScoreBreakdown, reason: string): string {
  return [
    reason,
    `distance_km: ${breakdown.distanceKm.toFixed(1)}`,
    `office_days_per_week: ${breakdown.officeDaysPerWeek}`,
    `annual_km: ${Math.round(breakdown.annualKm)}`,
    `emission_factor: ${breakdown.emissionFactorKgPerKm.toFixed(3)} kgCO2e/km`,
    `annual_kgco2e: ${Math.round(breakdown.annualKgCO2e)}`,
  ].join("\n");
}

function formatScore(
  score: ScoreResult,
  fallbackLocation: string,
): { text: string; title?: string; state: string } {
  switch (score.status) {
    case "set_postcode":
      return {
        text: "Set postcode",
        title: "Add a home postcode in the extension settings.",
        state: "no_data",
      };
    case "wfh":
      return {
        text: "0 kgCO2e/yr",
        title: formatWfhBreakdown(score.breakdown, score.reason),
        state: "ok",
      };
    case "no_data":
      return {
        text: "No data",
        title: score.reason,
        state: "no_data",
      };
    case "ok": {
      const annualKg = Math.round(score.breakdown.annualKgCO2e);
      return {
        text: `${annualKg} kgCO2e/yr`,
        title: formatBreakdown(score.breakdown, score.placeName || fallbackLocation),
        state: "ok",
      };
    }
    case "loading":
      return { text: "Loading...", state: "loading" };
    case "error":
      return { text: "Error", title: score.reason, state: "error" };
  }
}

function formatCreated(created: string): string {
  if (!created) {
    return "";
  }
  const parsed = new Date(created);
  if (Number.isNaN(parsed.getTime())) {
    return created;
  }
  return parsed.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildJobCard(
  documentRef: Document,
  scored: ScoredJob,
  actionLabel: string,
  onAction: (job: ProxyJob) => void,
): HTMLElement {
  const card = documentRef.createElement("article");
  card.className = "job-card";

  const details = documentRef.createElement("div");
  details.className = "job-details";

  const title = documentRef.createElement("h3");
  const titleText = scored.job.title || "Untitled role";
  const safeUrl = resolveSafeJobUrl(scored.job.redirect_url);
  if (safeUrl) {
    const link = documentRef.createElement("a");
    link.href = safeUrl;
    link.textContent = titleText;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    title.appendChild(link);
  } else {
    title.textContent = titleText;
  }

  const meta = documentRef.createElement("p");
  meta.className = "job-meta";
  const metaParts = [
    scored.job.company,
    scored.job.location_name,
    formatCreated(scored.job.created),
  ].filter(Boolean);
  meta.textContent = metaParts.join(" • ");

  const snippet = documentRef.createElement("p");
  snippet.className = "job-snippet";
  snippet.textContent = scored.job.description_snippet;

  details.append(title, meta, snippet);

  const actions = documentRef.createElement("div");
  actions.className = "job-actions";

  const scoreBadge = documentRef.createElement("span");
  scoreBadge.className = "score-badge";
  const scoreInfo = formatScore(scored.score, scored.job.location_name);
  scoreBadge.textContent = scoreInfo.text;
  scoreBadge.dataset.state = scoreInfo.state;
  if (scoreInfo.title) {
    scoreBadge.title = scoreInfo.title;
  }

  const actionButton = documentRef.createElement("button");
  actionButton.type = "button";
  actionButton.className = "ghost";
  actionButton.textContent = actionLabel;
  actionButton.addEventListener("click", () => onAction(scored.job));

  actions.append(scoreBadge, actionButton);

  card.append(details, actions);
  return card;
}

export function renderResults(
  container: HTMLElement,
  jobs: ScoredJob[],
  sortByCo2: boolean,
  onSave: (job: ProxyJob) => void,
): void {
  container.innerHTML = "";
  const ordered = sortByCo2 ? sortJobsByCo2(jobs) : jobs;
  if (ordered.length === 0) {
    const empty = container.ownerDocument.createElement("li");
    empty.className = "empty";
    empty.textContent = "No results yet. Run a search to see matches.";
    container.appendChild(empty);
    return;
  }

  for (const scored of ordered) {
    const item = container.ownerDocument.createElement("li");
    item.dataset.jobId = scored.job.id;
    item.appendChild(buildJobCard(container.ownerDocument, scored, "Save job", onSave));
    container.appendChild(item);
  }
}

export function renderSavedSearches(
  container: HTMLElement,
  searches: SavedSearch[],
  onRun: (query: SearchQuery) => void,
  onRemove: (id: string) => void,
): void {
  container.innerHTML = "";
  if (searches.length === 0) {
    const empty = container.ownerDocument.createElement("li");
    empty.className = "empty";
    empty.textContent = "No saved searches yet.";
    container.appendChild(empty);
    return;
  }

  for (const saved of searches) {
    const item = container.ownerDocument.createElement("li");
    const row = container.ownerDocument.createElement("div");
    row.className = "job-card";

    const details = container.ownerDocument.createElement("div");
    details.className = "job-details";
    const title = container.ownerDocument.createElement("h3");
    title.textContent = saved.label;
    const meta = container.ownerDocument.createElement("p");
    meta.className = "job-meta";
    const parts = [saved.query.q, saved.query.where].filter(Boolean).join(" • ");
    meta.textContent = parts || "All roles";
    details.append(title, meta);

    const actions = container.ownerDocument.createElement("div");
    actions.className = "job-actions";
    const runButton = container.ownerDocument.createElement("button");
    runButton.type = "button";
    runButton.className = "ghost";
    runButton.textContent = "Run";
    runButton.addEventListener("click", () => onRun(saved.query));
    const removeButton = container.ownerDocument.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => onRemove(saved.id));
    actions.append(runButton, removeButton);

    row.append(details, actions);
    item.appendChild(row);
    container.appendChild(item);
  }
}

export function renderSavedJobs(
  container: HTMLElement,
  jobs: ScoredJob[],
  onRemove: (id: string) => void,
): void {
  container.innerHTML = "";
  if (jobs.length === 0) {
    const empty = container.ownerDocument.createElement("li");
    empty.className = "empty";
    empty.textContent = "No saved jobs yet.";
    container.appendChild(empty);
    return;
  }

  for (const scored of jobs) {
    const item = container.ownerDocument.createElement("li");
    item.dataset.jobId = scored.job.id;
    item.appendChild(
      buildJobCard(container.ownerDocument, scored, "Remove", () => onRemove(scored.job.id)),
    );
    container.appendChild(item);
  }
}
