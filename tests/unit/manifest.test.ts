import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("extension manifest permissions", () => {
  it("limits content scripts and hosts to supported pages and APIs", () => {
    const manifest = JSON.parse(
      readFileSync(resolve("src/manifest.json"), "utf8"),
    ) as {
      host_permissions: string[];
      content_scripts: Array<{ matches: string[] }>;
    };

    expect(manifest.host_permissions).toEqual([
      "https://api.postcodes.io/*",
      "http://localhost:8787/*",
    ]);
    expect(manifest.host_permissions).not.toContain("https://*/*");
    expect(manifest.host_permissions).not.toContain("http://*/*");
    expect(manifest.content_scripts).toEqual([
      expect.objectContaining({ matches: ["https://www.reed.co.uk/jobs*"] }),
    ]);
  });
});
