import { describe, expect, it } from "vitest";
import {
  isEmployerResolveRequestMessage,
  isEmployerSignalsRequestMessage,
  isScoreRequestMessage,
  isSearchScoreRequestMessage,
  isTrustedExtensionSender,
} from "../../src/messages";

describe("extension runtime message validation", () => {
  it("accepts typed employer requests and rejects URL-bearing broker messages", () => {
    expect(
      isEmployerResolveRequestMessage({
        type: "employer_resolve_request",
        name: "Acme Ltd",
        hintLocation: "London",
      }),
    ).toBe(true);
    expect(
      isEmployerSignalsRequestMessage({
        type: "employer_signals_request",
        companyNumber: "01234567",
        companyName: "Acme Ltd",
      }),
    ).toBe(true);
    expect(
      isEmployerResolveRequestMessage({
        type: "fetch_json_request",
        url: "https://attacker.test/steal",
      }),
    ).toBe(false);
  });

  it("rejects oversized or malformed request fields", () => {
    const validScoreRequest = {
      type: "score_request",
      requestId: "request-1",
      locationName: "London",
      settings: {
        homePostcode: "SW1A 1AA",
        commuteMode: "car",
        officeDaysPerWeek: 3,
      },
    };
    expect(isScoreRequestMessage(validScoreRequest)).toBe(true);
    expect(
      isEmployerResolveRequestMessage({
        type: "employer_resolve_request",
        name: "x".repeat(301),
      }),
    ).toBe(false);
    expect(
      isEmployerSignalsRequestMessage({
        type: "employer_signals_request",
        companyNumber: "01234567",
        companyName: null,
      }),
    ).toBe(false);
    for (const settings of [
      {},
      { homePostcode: "SW1A 1AA", commuteMode: "plane", officeDaysPerWeek: 3 },
      { homePostcode: "x".repeat(17), commuteMode: "car", officeDaysPerWeek: 3 },
      { homePostcode: "SW1A 1AA", commuteMode: "car", officeDaysPerWeek: 5.5 },
      { homePostcode: "SW1A 1AA", commuteMode: "car", officeDaysPerWeek: Number.NaN },
      { homePostcode: "SW1A 1AA", commuteMode: "car", officeDaysPerWeek: 6 },
    ]) {
      expect(isScoreRequestMessage({ ...validScoreRequest, settings })).toBe(false);
    }
  });

  it("requires the extension runtime sender id", () => {
    expect(isTrustedExtensionSender({ id: "extension-id" }, "extension-id")).toBe(true);
    expect(isTrustedExtensionSender({ id: "other-extension" }, "extension-id")).toBe(false);
    expect(isTrustedExtensionSender({}, "extension-id")).toBe(false);
  });

  it("validates bounded search scoring batches", () => {
    const request = {
      type: "search_score_request",
      requestId: "search-1",
      jobs: [
        {
          id: "job-1",
          title: "Engineer",
          company: "Example",
          redirect_url: "https://jobs.example/job-1",
          created: "2026-10-04",
          description_snippet: "Role",
          location_name: "London",
          lat: 51.5,
          lon: -0.1,
        },
      ],
      settings: {
        homePostcode: "SW1A 1AA",
        commuteMode: "rail",
        officeDaysPerWeek: 3,
      },
      home: { latitude: 51.5, longitude: -0.1 },
      remoteOverride: false,
    };

    expect(isSearchScoreRequestMessage(request)).toBe(true);
    expect(isSearchScoreRequestMessage({ ...request, jobs: new Array(251).fill(request.jobs[0]) }))
      .toBe(false);
    expect(isSearchScoreRequestMessage({ ...request, home: { latitude: 91, longitude: 0 } }))
      .toBe(false);
    expect(isSearchScoreRequestMessage({ ...request, jobs: [{ ...request.jobs[0], lat: NaN }] }))
      .toBe(false);
  });
});
