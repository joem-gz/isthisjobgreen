import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { waitForExtensionWorker } from "./extension_worker";

const fixtureJson = readFileSync(
  resolve("tests/fixtures/adzuna_search_results.json"),
  "utf-8",
);
const headless = process.env.PLAYWRIGHT_HEADLESS === "1";

test("renders search results and sorting", async () => {
  test.setTimeout(60_000);
  const extensionPath = resolve("dist");
  const userDataDir = mkdtempSync(join(tmpdir(), "carbonrank-e2e-"));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  await context.route("http://localhost:8787/api/jobs/search*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: fixtureJson,
    });
  });

  await context.route("https://api.postcodes.io/postcodes/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: 200,
        result: { latitude: 51.501, longitude: -0.141 },
      }),
    });
  });

  const worker = await waitForExtensionWorker(context);

  await worker.evaluate(() =>
    chrome.storage.sync.set({
      carbonrankSettings: {
        homePostcode: "SW1A 1AA",
        commuteMode: "car",
        officeDaysPerWeek: 3,
      },
    }),
  );

  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pages/search/search.html`, {
    waitUntil: "domcontentloaded",
  });

  await page.fill("#search-query", "designer");
  await page.fill("#search-where", "London");
  await page.click("button[type=submit]");

  const badges = page.locator(".score-badge");
  await expect(badges).toHaveCount(3);
  await expect(badges.nth(1)).toHaveText("No data");
  await expect(badges.nth(2)).toHaveText("0 kgCO2e/yr");

  await page.check("#sort-co2");
  const jobOrder = await page
    .locator("#results li")
    .evaluateAll((items) => items.map((item) => item.dataset.jobId));
  expect(jobOrder[0]).toBe("remote-1");

  await context.close();
});
