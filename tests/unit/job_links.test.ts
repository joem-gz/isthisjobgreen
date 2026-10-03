import { describe, expect, it } from "vitest";
import { resolveSafeJobUrl } from "../../src/search/job_links";

describe("resolveSafeJobUrl", () => {
  it("accepts HTTPS provider destinations", () => {
    expect(resolveSafeJobUrl("https://jobs.example.test/roles/123")).toBe(
      "https://jobs.example.test/roles/123",
    );
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://jobs.example.test/roles/123",
    "https://user:password@jobs.example.test/roles/123",
    "not a URL",
  ])("rejects unsafe or malformed destination %s", (value) => {
    expect(resolveSafeJobUrl(value)).toBeNull();
  });
});
