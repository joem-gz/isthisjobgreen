import {
  CommuteMode,
  getSettings,
  isValidUkPostcode,
  normalizePostcode,
  setSettings,
} from "../storage/settings";
import { setAttributionLink } from "../ui/attribution";

function queryRequired<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Popup DOM missing required element: ${selector}`);
  }
  return element;
}

const form = queryRequired<HTMLFormElement>("#settings-form");
const postcodeInput = queryRequired<HTMLInputElement>("#home-postcode");
const commuteSelect = queryRequired<HTMLSelectElement>("#commute-mode");
const officeSelect = queryRequired<HTMLSelectElement>("#office-days");
const statusEl = queryRequired<HTMLParagraphElement>("#status");
const openSearchButton = queryRequired<HTMLButtonElement>("#open-search");
const attributionLink = queryRequired<HTMLAnchorElement>("#popup-attribution");

setAttributionLink(attributionLink);

function setStatus(message: string, state: "ok" | "error" = "ok"): void {
  statusEl.textContent = message;
  statusEl.dataset.state = state;
}

async function loadSettings(): Promise<void> {
  const settings = await getSettings();
  postcodeInput.value = settings.homePostcode;
  commuteSelect.value = settings.commuteMode;
  officeSelect.value = String(settings.officeDaysPerWeek);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const rawPostcode = postcodeInput.value.trim();
  const commuteMode = commuteSelect.value as CommuteMode;
  const officeDaysPerWeek = Number(officeSelect.value);

  if (rawPostcode && !isValidUkPostcode(rawPostcode)) {
    setStatus("Enter a valid UK postcode.", "error");
    return;
  }

  const normalised = rawPostcode ? normalizePostcode(rawPostcode) : "";

  await setSettings({
    homePostcode: normalised,
    commuteMode,
    officeDaysPerWeek,
  });

  postcodeInput.value = normalised;
  setStatus("Settings saved.");
});

openSearchButton.addEventListener("click", () => {
  const url = chrome.runtime.getURL("pages/search/search.html");
  chrome.tabs.create({ url });
});

void loadSettings().catch((error) => {
  console.error("Failed to load settings", error);
  setStatus("Unable to load settings.", "error");
});
