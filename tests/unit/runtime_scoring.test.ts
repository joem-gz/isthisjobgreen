import { describe, expect, it, vi } from "vitest";
import {
  scoreLocationViaRuntime,
  scoreSearchJobsViaRuntime,
} from "../../src/scoring/runtime";

const settings = {
  homePostcode: "SW1A 1AA",
  commuteMode: "rail" as const,
  officeDaysPerWeek: 3,
};

describe("runtime scoring client", () => {
  it("requests a location score from the service worker", async () => {
    const sendMessage = vi.fn((message, callback) => {
      callback({
        type: "score_response",
        requestId: message.requestId,
        result: { status: "no_data", reason: "Test" },
      });
    });

    await expect(
      scoreLocationViaRuntime("London", settings, {
        sendMessage,
        createRequestId: () => "score-1",
        getLastError: () => undefined,
      }),
    ).resolves.toEqual({ status: "no_data", reason: "Test" });
    expect(sendMessage.mock.calls[0][0]).toMatchObject({
      type: "score_request",
      requestId: "score-1",
      locationName: "London",
    });
  });

  it("requests batch search scores without importing the location index", async () => {
    const job = {
      id: "job-1",
      title: "Engineer",
      company: "Example",
      redirect_url: "https://jobs.example/job-1",
      created: "",
      description_snippet: "",
      location_name: "Remote",
      lat: null,
      lon: null,
    };
    const results = [{
      job,
      score: { status: "wfh" as const, reason: "Remote role", breakdown: {
        distanceKm: 0,
        officeDaysPerWeek: 3,
        annualKm: 0,
        emissionFactorKgPerKm: 0,
        annualKgCO2e: 0,
      } },
      scoreValue: 0,
    }];
    const sendMessage = vi.fn((message, callback) => {
      callback({ type: "search_score_response", requestId: message.requestId, results });
    });

    await expect(
      scoreSearchJobsViaRuntime([job], settings, null, false, {
        sendMessage,
        createRequestId: () => "search-1",
        getLastError: () => undefined,
      }),
    ).resolves.toEqual(results);
    expect(sendMessage.mock.calls[0][0]).toMatchObject({
      type: "search_score_request",
      requestId: "search-1",
      remoteOverride: false,
    });
  });

  it("rejects mismatched service-worker responses", async () => {
    const sendMessage = vi.fn((_message, callback) => {
      callback({
        type: "score_response",
        requestId: "other",
        result: { status: "no_data", reason: "Test" },
      });
    });

    await expect(
      scoreLocationViaRuntime("London", settings, {
        sendMessage,
        createRequestId: () => "score-1",
        getLastError: () => undefined,
      }),
    ).rejects.toThrow("Invalid service-worker scoring response");
  });
});
