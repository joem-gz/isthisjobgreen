import { describe, expect, it, vi } from "vitest";
import { fetchProxyJobs } from "../../src/search/api";
import { scoreJobs } from "../../src/search/scoring";
import { SearchQuery } from "../../src/search/types";
import { Settings } from "../../src/storage/settings";
import { renderResults } from "../../src/pages/search/render";

const query: SearchQuery = {
  q: "designer",
  where: "London",
  page: 1,
  remoteOnly: false,
};

const settings: Settings = {
  homePostcode: "SW1A 1AA",
  commuteMode: "car",
  officeDaysPerWeek: 3,
};

describe("search UI", () => {
  it("renders proxy results and sorts by CO2", async () => {
    const fetchMock = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({
          count: 3,
          page: 1,
          results: [
            {
              id: "remote-1",
              title: "Remote Designer",
              company: "Remote Co",
              redirect_url: "https://example.com/remote",
              created: "2024-01-02",
              description_snippet: "Remote role",
              location_name: "Remote",
              lat: null,
              lon: null,
            },
            {
              id: "london-1",
              title: "London Designer",
              company: "City Co",
              redirect_url: "https://example.com/london",
              created: "2024-01-03",
              description_snippet: "London role",
              location_name: "London",
              lat: 51.5072,
              lon: -0.1276,
            },
            {
              id: "uk-1",
              title: "UK Designer",
              company: "UK Co",
              redirect_url: "https://example.com/uk",
              created: "2024-01-04",
              description_snippet: "UK role",
              location_name: "United Kingdom",
              lat: null,
              lon: null,
            },
          ],
        }),
      }) as Response,
    );

    const response = await fetchProxyJobs(query, fetchMock, "http://localhost:8787");
    const scored = scoreJobs(response.results, settings, {
      latitude: 51.501,
      longitude: -0.141,
    });

    const container = document.createElement("ul");
    renderResults(container, scored, true, () => undefined);

    const jobIds = Array.from(container.querySelectorAll("li")).map(
      (item) => item.dataset.jobId,
    );

    expect(jobIds[0]).toBe("remote-1");
    expect(jobIds).toContain("london-1");
    expect(jobIds).toContain("uk-1");

    const links = Array.from(container.querySelectorAll("a"));
    expect(links).toHaveLength(3);
    expect(links[0].rel).toBe("noopener noreferrer");
    expect(links[0].target).toBe("_blank");
  });

  it("renders malformed provider URLs as non-clickable text", () => {
    const container = document.createElement("ul");
    renderResults(
      container,
      [
        {
          job: {
            id: "unsafe",
            title: "Unsafe role",
            company: "Example Co",
            redirect_url: "javascript:alert(1)",
            created: "",
            description_snippet: "",
            location_name: "Remote",
            lat: null,
            lon: null,
          },
          score: { status: "wfh", breakdown: { distanceKm: 0, officeDaysPerWeek: 3, annualKm: 0, emissionFactorKgPerKm: 0, annualKgCO2e: 0 }, reason: "Remote role" },
          scoreValue: 0,
        },
      ],
      false,
      () => undefined,
    );

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("h3")?.textContent).toBe("Unsafe role");
  });
});
