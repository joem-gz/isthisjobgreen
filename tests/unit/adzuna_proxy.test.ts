import { describe, expect, it, vi } from "vitest";
import {
  buildAdzunaUrl,
  fetchAdzunaJobs,
  normalizeAdzunaResults,
} from "../../server/adzuna";

const config = {
  appId: "app-id",
  appKey: "app-key",
  country: "gb",
  resultsPerPage: 5,
};

describe("Adzuna proxy helpers", () => {
  it("builds an Adzuna search URL", () => {
    const url = buildAdzunaUrl(
      {
        q: "designer",
        where: "London",
        page: 2,
        radiusKm: 15,
        remoteOnly: true,
      },
      config,
    );

    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1/api/jobs/gb/search/2");
    expect(parsed.searchParams.get("app_id")).toBe("app-id");
    expect(parsed.searchParams.get("app_key")).toBe("app-key");
    expect(parsed.searchParams.get("results_per_page")).toBe("5");
    expect(parsed.searchParams.get("what")).toBe("designer remote");
    expect(parsed.searchParams.get("where")).toBe("London");
    expect(parsed.searchParams.get("distance")).toBe("15");
  });

  it("normalises Adzuna results", () => {
    const results = normalizeAdzunaResults({
      results: [
        {
          id: 123,
          title: "Senior Analyst",
          company: { display_name: "Acme Ltd" },
          redirect_url: "https://example.com/job/123",
          created: "2024-01-02",
          description: "An exciting role",
          location: { display_name: "London", latitude: 51.5, longitude: -0.1 },
        },
      ],
    });

    expect(results[0]).toEqual({
      id: "123",
      title: "Senior Analyst",
      company: "Acme Ltd",
      redirect_url: "https://example.com/job/123",
      created: "2024-01-02",
      description_snippet: "An exciting role",
      location_name: "London",
      lat: 51.5,
      lon: -0.1,
    });
  });

  it("fetches and normalises Adzuna jobs", async () => {
    const fetchMock = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({
          count: 1,
          results: [
            {
              id: "abc",
              title: "Engineer",
              company: "Remote Co",
              redirect_url: "https://example.com/job/abc",
              created: "2024-02-01",
              description_snippet: "Remote role",
              location: { display_name: "Remote" },
            },
          ],
        }),
      }) as Response,
    );

    const response = await fetchAdzunaJobs(
      {
        q: "engineer",
        where: "",
        page: 1,
        remoteOnly: false,
      },
      config,
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.count).toBe(1);
    expect(response.results[0].company).toBe("Remote Co");
  });

  it("aborts a slow Adzuna request at its configured deadline", async () => {
    const fetchMock = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        }),
    );

    await expect(
      fetchAdzunaJobs(
        { q: "engineer", where: "", page: 1, remoteOnly: false },
        { ...config, timeoutMs: 1 },
        fetchMock,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
