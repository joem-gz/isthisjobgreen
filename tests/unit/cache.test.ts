import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedGeocode, getMemoryCache, setCachedGeocode } from "../../src/storage/cache";

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

  return local;
}

describe("geocode cache", () => {
  let store: Store;

  beforeEach(() => {
    store = {};
    installChromeStorageMock(store);
  });

  it("stores and retrieves cache entries", async () => {
    await setCachedGeocode("SW1A 1AA", { lat: 51.5, lng: -0.1, updatedAt: 123 });

    const cached = await getCachedGeocode("SW1A 1AA");
    expect(cached).toEqual({ lat: 51.5, lng: -0.1, updatedAt: 123 });
  });

  it("hydrates memory cache on read", async () => {
    store.carbonrankGeocodeCache = {
      "M1 1AE": { lat: 53.48, lng: -2.24, updatedAt: 456 },
    };

    const cached = await getCachedGeocode("M1 1AE");
    expect(cached).toEqual({ lat: 53.48, lng: -2.24, updatedAt: 456 });

    const memory = getMemoryCache("M1 1AE");
    expect(memory).toEqual({ lat: 53.48, lng: -2.24, updatedAt: 456 });
  });
});
