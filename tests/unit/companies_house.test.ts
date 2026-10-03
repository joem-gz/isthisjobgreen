import { describe, expect, it, vi } from "vitest";
import {
  buildCompaniesHouseAuthHeader,
  classifyOrganisationFromSic,
  fetchCompaniesHouseProfile,
  fetchCompaniesHouseSearch,
  normalizeCompanyName,
  rankCompanies,
} from "../../server/companies_house";

describe("Companies House helpers", () => {
  it("normalizes company names by stripping suffixes", () => {
    expect(normalizeCompanyName("Acme Ltd.")).toBe("acme");
    expect(normalizeCompanyName("Example Company PLC")).toBe("example");
    expect(normalizeCompanyName("Foobar Incorporated")).toBe("foobar");
  });

  it("ranks candidates using name and location signals", () => {
    const candidates = rankCompanies(
      "Acme Ltd",
      [
        {
          company_number: "123",
          title: "Acme Ltd",
          company_status: "active",
          address_snippet: "10 Example Road, London",
        },
        {
          company_number: "456",
          title: "Acme Holdings",
          company_status: "active",
          address_snippet: "Manchester",
        },
      ],
      "London",
    );

    expect(candidates[0].company_number).toBe("123");
    expect(candidates[0].reasons).toContain("exact_normalized_match");
    expect(candidates[0].reasons).toContain("location_hint_match");
    expect(candidates[0].score).toBeGreaterThan(candidates[1].score);
  });

  it("classifies recruitment agency SIC codes", () => {
    expect(classifyOrganisationFromSic(["78109"]).org_classification).toBe("agency");
    expect(classifyOrganisationFromSic(["62020"]).org_classification).toBe("employer");
    expect(classifyOrganisationFromSic([]).org_classification).toBe("unknown");
  });

  it("fetches company search results with auth", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      expect(input).toBe("https://example.test/search/companies?q=Acme");
      expect(headers?.Authorization).toBe(buildCompaniesHouseAuthHeader("api-key"));
      return {
        ok: true,
        json: async () => ({
          items: [{ company_number: "001", title: "Acme Ltd" }],
        }),
      } as Response;
    });

    const response = await fetchCompaniesHouseSearch("Acme", {
      apiKey: "api-key",
      fetchFn: fetchMock,
      baseUrl: "https://example.test",
    });

    expect(response.items?.[0].company_number).toBe("001");
  });

  it("fetches company profile with auth", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      expect(input).toBe("https://example.test/company/001");
      expect(headers?.Authorization).toBe(buildCompaniesHouseAuthHeader("api-key"));
      return {
        ok: true,
        json: async () => ({ company_number: "001", sic_codes: ["62020"] }),
      } as Response;
    });

    const response = await fetchCompaniesHouseProfile("001", {
      apiKey: "api-key",
      fetchFn: fetchMock,
      baseUrl: "https://example.test",
    });

    expect(response.sic_codes).toEqual(["62020"]);
  });

  it("aborts a slow Companies House request at its configured deadline", async () => {
    const fetchMock = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        }),
    );

    await expect(
      fetchCompaniesHouseSearch("Acme", {
        apiKey: "api-key",
        fetchFn: fetchMock,
        baseUrl: "https://example.test",
        timeoutMs: 1,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
