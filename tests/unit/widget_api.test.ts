import { describe, expect, it, vi } from "vitest";
import {
  createWidgetService,
  validateWidgetScoreRequest,
  WidgetScoreRequest,
  WidgetScoreResponse,
} from "../../server/widget_service";

const baseRequest: WidgetScoreRequest = {
  locationName: "London",
  lat: 51.5074,
  lon: -0.1278,
};

const okResponse: WidgetScoreResponse = {
  status: "ok",
  badgeText: "10 kgCO2e/yr",
  score: 10,
  breakdown: {
    distanceKm: 2,
    officeDaysPerWeek: 3,
    annualKm: 120,
    emissionFactorKgPerKm: 0.2,
    annualKgCO2e: 10,
  },
};

describe("widget API service", () => {
  it("rejects invalid API keys", () => {
    const service = createWidgetService({
      partners: [{ key: "valid", name: "Test", origins: ["https://partner.test"] }],
    });

    const result = service.handleScoreRequest(baseRequest, {
      apiKey: "invalid",
      origin: null,
      ip: "127.0.0.1",
    });

    expect(result.status).toBe(401);
  });

  it("rejects browser requests even when they present a valid server key", () => {
    const service = createWidgetService({
      partners: [{ key: "valid", name: "Test", origins: ["https://allowed.test"] }],
    });

    const result = service.handleScoreRequest(baseRequest, {
      apiKey: "valid",
      origin: "https://allowed.test",
      ip: "127.0.0.1",
    });

    expect(result.status).toBe(403);
  });

  it("rejects even an empty Origin header", () => {
    const service = createWidgetService({
      partners: [{ key: "valid", name: "Test", origins: ["https://allowed.test"] }],
    });

    const result = service.handleScoreRequest(baseRequest, {
      apiKey: "valid",
      origin: "",
      ip: "127.0.0.1",
    });

    expect(result.status).toBe(403);
  });

  it("applies rate limits per partner", () => {
    const service = createWidgetService(
      {
        partners: [
          {
            key: "valid",
            name: "Test",
            origins: ["https://partner.test"],
            rateLimit: { windowMs: 60_000, max: 1 },
          },
        ],
      },
      {
        scoreJob: () => okResponse,
      },
    );

    const context = {
      apiKey: "valid",
      origin: null,
      ip: "127.0.0.1",
    };

    const first = service.handleScoreRequest(baseRequest, context);
    const second = service.handleScoreRequest(baseRequest, context);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("caches score responses by job URL", () => {
    const scoreJob = vi.fn(() => okResponse);
    const service = createWidgetService(
      {
        partners: [
          {
            key: "valid",
            name: "Test",
            origins: ["https://partner.test"],
          },
        ],
      },
      { scoreJob },
    );

    const request = {
      ...baseRequest,
      jobUrl: "https://partner.test/jobs/123",
    };

    const context = {
      apiKey: "valid",
      origin: null,
      ip: "127.0.0.1",
    };

    const first = service.handleScoreRequest(request, context);
    const second = service.handleScoreRequest(request, context);

    expect(first.status).toBe(200);
    expect(second.headers?.["X-CarbonRank-Cache"]).toBe("HIT");
    expect(scoreJob).toHaveBeenCalledTimes(1);
  });

  it("does not share cached scores when score-affecting fields differ", () => {
    const scoreJob = vi.fn(() => okResponse);
    const service = createWidgetService(
      {
        partners: [
          {
            key: "valid",
            name: "Test",
            origins: ["https://partner.test"],
          },
        ],
      },
      { scoreJob },
    );
    const context = { apiKey: "valid", origin: null, ip: "127.0.0.1" };

    service.handleScoreRequest(
      { ...baseRequest, jobUrl: "https://partner.test/jobs/123" },
      context,
    );
    service.handleScoreRequest(
      { ...baseRequest, lat: 52, jobUrl: "https://partner.test/jobs/123" },
      context,
    );

    expect(scoreJob).toHaveBeenCalledTimes(2);
  });

  it("rejects job URLs outside the partner allowlist", () => {
    const service = createWidgetService({
      partners: [{ key: "valid", name: "Test", origins: ["https://partner.test"] }],
    });

    const result = service.handleScoreRequest(
      { ...baseRequest, jobUrl: "https://attacker.test/jobs/123" },
      { apiKey: "valid", origin: null, ip: "127.0.0.1" },
    );

    expect(result.status).toBe(403);
  });
});

describe("widget request validation", () => {
  it("accepts and normalizes a bounded request", () => {
    const result = validateWidgetScoreRequest({
      title: "  Engineer  ",
      locationName: "London",
      lat: 51.5,
      lon: -0.12,
      remoteFlag: false,
      jobUrl: "https://partner.test/jobs/123",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        title: "Engineer",
        employer: undefined,
        locationName: "London",
        lat: 51.5,
        lon: -0.12,
        remoteFlag: false,
        jobUrl: "https://partner.test/jobs/123",
      },
    });
  });

  it.each([
    [null, "JSON object"],
    [{ remoteFlag: "true" }, "boolean"],
    [{ lat: 91, lon: 0 }, "finite coordinate"],
    [{ lat: 51.5 }, "provided together"],
    [{ jobUrl: "javascript:alert(1)" }, "http or https"],
    [{ extra: true }, "Unknown field"],
  ])("rejects invalid request %#", (request, expectedError) => {
    const result = validateWidgetScoreRequest(request);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(expectedError);
    }
  });
});
