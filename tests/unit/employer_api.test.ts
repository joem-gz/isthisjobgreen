import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEmployerResolve } from "../../src/employer/api";

describe("employer api runtime fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses runtime messaging when available", async () => {
    const payload = { candidates: [], cached: false };
    const sendMessage = vi.fn((message, callback) => {
      callback({
        type: "employer_response",
        ok: true,
        status: 200,
        data: payload,
      });
    });
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
        lastError: undefined,
      },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchEmployerResolve("Acme Ltd", "London");

    expect(sendMessage).toHaveBeenCalled();
    const [message] = sendMessage.mock.calls[0];
    expect(message.type).toBe("employer_resolve_request");
    expect(message).toMatchObject({ name: "Acme Ltd", hintLocation: "London" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual(payload);
  });

  it("falls back to fetch when runtime is unavailable", async () => {
    const payload = { candidates: [], cached: false };
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await fetchEmployerResolve("Beta Ltd", "Manchester");

    expect(fetchSpy).toHaveBeenCalled();
    expect(result).toEqual(payload);
  });
});
