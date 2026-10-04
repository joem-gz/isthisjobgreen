import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  getSettings,
  isValidUkPostcode,
  normalizePostcode,
  setSettings,
} from "../../src/storage/settings";

type Store = Record<string, unknown>;
function installChromeStorageMock(store: Store) {
  const sync = {
    get: vi.fn(async (key: string | string[]) => {
      if (Array.isArray(key)) {
        const result: Record<string, unknown> = {};
        for (const entry of key) {
          result[entry] = store[entry];
        }
        return result;
      }
      return { [key]: store[key] };
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
  };

  vi.stubGlobal("chrome", {
    storage: {
      sync,
    },
  });

  return sync;
}

describe("settings storage", () => {
  let store: Store;

  beforeEach(() => {
    store = {};
    installChromeStorageMock(store);
  });

  it("returns defaults when storage is empty", async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("persists settings in storage", async () => {
    const updated = await setSettings({
      homePostcode: "SW1A 1AA",
      commuteMode: "bus",
      officeDaysPerWeek: 4,
    });

    expect(updated.homePostcode).toBe("SW1A 1AA");

    const roundTrip = await getSettings();
    expect(roundTrip).toEqual(updated);
  });

  it("sanitises invalid stored settings", async () => {
    store.carbonrankSettings = {
      homePostcode: 123,
      commuteMode: "rocket",
      officeDaysPerWeek: 9,
    };

    const settings = await getSettings();
    expect(settings.commuteMode).toBe(DEFAULT_SETTINGS.commuteMode);
    expect(settings.officeDaysPerWeek).toBe(5);
    expect(settings.homePostcode).toBe("");
  });
});

describe("postcode validation", () => {
  it("normalises common postcode formats", () => {
    expect(normalizePostcode("sw1a1aa")).toBe("SW1A 1AA");
    expect(normalizePostcode("  ec1a 1bb ")).toBe("EC1A 1BB");
  });

  it("accepts valid UK postcodes", () => {
    expect(isValidUkPostcode("SW1A 1AA")).toBe(true);
    expect(isValidUkPostcode("EC1A1BB")).toBe(true);
    expect(isValidUkPostcode("W1A 0AX")).toBe(true);
  });

  it("rejects invalid postcodes", () => {
    expect(isValidUkPostcode("")).toBe(false);
    expect(isValidUkPostcode("12345")).toBe(false);
    expect(isValidUkPostcode("ABCDE")).toBe(false);
  });
});
