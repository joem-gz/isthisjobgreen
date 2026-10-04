import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodePostcode } from "../../src/geocoding/postcodes";

type Store = Record<string, unknown>;

function installChromeStorageMock(store: Store) {
  const local = {
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
      local,
    },
  });
}

describe("geocodePostcode", () => {
  let store: Store;

  beforeEach(() => {
    store = {};
    installChromeStorageMock(store);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and caches postcodes.io results", async () => {
    const fetchMock = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({
          status: 200,
          result: { latitude: 51.501, longitude: -0.141 },
        }),
      }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePostcode("SW1A 1AA");
    expect(result).toEqual({ latitude: 51.501, longitude: -0.141 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.postcodes.io/postcodes/SW1A%201AA",
    );

    const cached = await geocodePostcode("SW1A 1AA");
    expect(cached).toEqual({ latitude: 51.501, longitude: -0.141 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null for invalid postcodes", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodePostcode("INVALID");
    expect(result).toBeNull();
  });
});
