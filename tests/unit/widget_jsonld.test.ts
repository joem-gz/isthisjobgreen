import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { init, resolveScoreEndpoint } from "../../widget/src/index";

function loadFixture(path: string): Document {
  const url = new URL(path, import.meta.url);
  const html = readFileSync(url, "utf-8");
  return new DOMParser().parseFromString(html, "text/html");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("widget JobPosting JSON-LD", () => {
  it("only resolves same-origin browser score endpoints", () => {
    expect(
      resolveScoreEndpoint("/api/widget/score", "https://partner.test/jobs/123"),
    ).toBe("https://partner.test/api/widget/score");
    expect(
      resolveScoreEndpoint(
        "https://central-api.test/api/widget/score",
        "https://partner.test/jobs/123",
      ),
    ).toBeNull();
  });

  it("renders remote JSON-LD roles without API calls", async () => {
    const doc = loadFixture("../fixtures/widget_jobposting_remote.html");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    init({ doc, apiBaseUrl: "/api/widget/score" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const badge = doc.querySelector(
      "[data-carbonrank-detail] .carbonrank-widget__badge",
    );
    expect(badge?.textContent).toBe("0 kgCO2e/yr");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests scores with geo coordinates when available", async () => {
    const doc = loadFixture("../fixtures/widget_jobposting_onsite.html");
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => ({
      ok: true,
      json: async () => ({ status: "ok", score: 210 }),
    }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    init({ doc, apiBaseUrl: "/api/widget/score" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const badge = doc.querySelector(
      "[data-carbonrank-detail] .carbonrank-widget__badge",
    );
    expect(badge?.textContent).toBe("210 kgCO2e/yr");

    const requestInit = fetchMock.mock.calls[0]?.[1];
    if (!requestInit || typeof requestInit.body !== "string") {
      throw new Error("Missing request body");
    }
    const body = JSON.parse(requestInit.body);
    expect(body.lat).toBeCloseTo(51.4545, 4);
    expect(body.lon).toBeCloseTo(-2.5879, 4);
    expect(requestInit.credentials).toBe("same-origin");
    expect(requestInit.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("renders no-data when JobPosting lacks location", async () => {
    const doc = loadFixture("../fixtures/widget_jobposting_missing.html");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    init({ doc, apiBaseUrl: "/api/widget/score" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const badge = doc.querySelector(
      "[data-carbonrank-detail] .carbonrank-widget__badge",
    );
    expect(badge?.textContent).toBe("No data");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
