import { geocodePostcode } from "../../geocoding/postcodes";
import { fetchProxyJobs } from "../../search/api";
import { scoreJobs } from "../../search/scoring";
import { ProxyJob, ScoredJob, SearchQuery } from "../../search/types";
import { DEFAULT_SETTINGS, getSettings, Settings } from "../../storage/settings";
import { setAttributionLink } from "../../ui/attribution";
import {
  getSavedJobs,
  getSavedSearches,
  removeJob,
  removeSearch,
  saveJob,
  saveSearch,
  SavedJob,
  SavedSearch,
} from "../../storage/search";
import {
  renderResults,
  renderSavedJobs,
  renderSavedSearches,
} from "./render";

type SearchState = {
  settings: Settings;
  homeLatLng: { latitude: number; longitude: number } | null;
  lastQuery: SearchQuery | null;
  rawResults: ProxyJob[];
  scoredResults: ScoredJob[];
  savedJobs: SavedJob[];
  savedSearches: SavedSearch[];
};

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Search page DOM missing required element: ${selector}`);
  }
  return element;
}

const form = queryRequired<HTMLFormElement>("#search-form");
const queryInput = queryRequired<HTMLInputElement>("#search-query");
const whereInput = queryRequired<HTMLInputElement>("#search-where");
const radiusInput = queryRequired<HTMLInputElement>("#search-radius");
const pageInput = queryRequired<HTMLInputElement>("#search-page");
const remoteOnlyInput = queryRequired<HTMLInputElement>("#remote-only");
const sortInput = queryRequired<HTMLInputElement>("#sort-co2");
const saveSearchButton = queryRequired<HTMLButtonElement>("#save-search");
const statusEl = queryRequired<HTMLParagraphElement>("#status");
const resultsEl = queryRequired<HTMLUListElement>("#results");
const savedSearchesEl = queryRequired<HTMLUListElement>("#saved-searches");
const savedJobsEl = queryRequired<HTMLUListElement>("#saved-jobs");
const homePostcodeEl = queryRequired<HTMLSpanElement>("#home-postcode-value");
const resultCountEl = queryRequired<HTMLSpanElement>("#result-count");
const attributionLink = queryRequired<HTMLAnchorElement>("#search-attribution");

setAttributionLink(attributionLink);

const state: SearchState = {
  settings: DEFAULT_SETTINGS,
  homeLatLng: null,
  lastQuery: null,
  rawResults: [],
  scoredResults: [],
  savedJobs: [],
  savedSearches: [],
};

function setStatus(message: string, stateValue: "ok" | "error" = "ok"): void {
  statusEl.textContent = message;
  statusEl.dataset.state = stateValue;
}

function setResultCount(count: number | null): void {
  resultCountEl.textContent = count === null ? "" : `${count} jobs`;
}

function readQueryFromForm(): SearchQuery {
  const page = Number.parseInt(pageInput.value || "1", 10);
  const radius = Number.parseFloat(radiusInput.value);
  return {
    q: queryInput.value.trim(),
    where: whereInput.value.trim(),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    radiusKm: Number.isFinite(radius) && radius > 0 ? radius : undefined,
    remoteOnly: remoteOnlyInput.checked,
  };
}

function applyQueryToForm(query: SearchQuery): void {
  queryInput.value = query.q;
  whereInput.value = query.where;
  pageInput.value = String(query.page);
  radiusInput.value = query.radiusKm ? String(query.radiusKm) : "";
  remoteOnlyInput.checked = query.remoteOnly;
}


function buildSearchLabel(query: SearchQuery): string {
  const parts = [query.q || "All roles", query.where || "Anywhere"];
  return parts.join(" • ");
}

async function refreshSavedSearches(): Promise<void> {
  state.savedSearches = await getSavedSearches();
  renderSavedSearches(savedSearchesEl, state.savedSearches, (query) => {
    applyQueryToForm(query);
    void runSearch(query);
  }, async (id) => {
    await removeSearch(id);
    await refreshSavedSearches();
  });
}

async function refreshSavedJobs(): Promise<void> {
  state.savedJobs = await getSavedJobs();
  const scored = scoreJobs(
    state.savedJobs,
    state.settings,
    state.homeLatLng,
    { remoteOverride: false },
  );
  renderSavedJobs(savedJobsEl, scored, async (id) => {
    await removeJob(id);
    await refreshSavedJobs();
  });
}

async function refreshSettings(): Promise<void> {
  state.settings = await getSettings();
  homePostcodeEl.textContent = state.settings.homePostcode || "Not set";
  state.homeLatLng = state.settings.homePostcode
    ? await geocodePostcode(state.settings.homePostcode)
    : null;

  if (state.settings.homePostcode && !state.homeLatLng) {
    setStatus("Unable to resolve home postcode.", "error");
  }

  if (state.rawResults.length > 0) {
    state.scoredResults = scoreJobs(state.rawResults, state.settings, state.homeLatLng, {
      remoteOverride: state.lastQuery?.remoteOnly ?? false,
    });
    renderResults(resultsEl, state.scoredResults, sortInput.checked, handleSaveJob);
  }

  await refreshSavedJobs();
}

async function runSearch(query: SearchQuery): Promise<void> {
  setStatus("Searching...");
  setResultCount(null);
  state.lastQuery = query;

  try {
    const response = await fetchProxyJobs(query);
    state.rawResults = response.results ?? [];
    state.scoredResults = scoreJobs(state.rawResults, state.settings, state.homeLatLng, {
      remoteOverride: query.remoteOnly,
    });
    renderResults(resultsEl, state.scoredResults, sortInput.checked, handleSaveJob);
    setResultCount(response.count ?? state.rawResults.length);
    setStatus("Search complete.");
  } catch (error) {
    console.error("Search failed", error);
    setStatus("Unable to fetch results from the proxy.", "error");
  }
}

async function handleSaveJob(job: ProxyJob): Promise<void> {
  await saveJob({
    ...job,
    savedAt: Date.now(),
  });
  setStatus("Job saved.");
  await refreshSavedJobs();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = readQueryFromForm();
  await runSearch(query);
});

sortInput.addEventListener("change", () => {
  renderResults(resultsEl, state.scoredResults, sortInput.checked, handleSaveJob);
});

saveSearchButton.addEventListener("click", async () => {
  const query = readQueryFromForm();
  const saved: SavedSearch = {
    id: crypto.randomUUID(),
    label: buildSearchLabel(query),
    query,
    savedAt: Date.now(),
  };
  await saveSearch(saved);
  setStatus("Search saved.");
  await refreshSavedSearches();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.carbonrankSettings) {
    void refreshSettings();
  }
});

void refreshSettings()
  .then(refreshSavedSearches)
  .catch((error) => {
    console.error("Failed to initialise search page", error);
    setStatus("Unable to load settings.", "error");
  });
