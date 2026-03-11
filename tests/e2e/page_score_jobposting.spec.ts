import { readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test, expect, chromium } from "@playwright/test";
import { waitForExtensionWorker } from "./extension_worker";

const fixtureHtml = readFileSync(
  resolve("tests/fixtures/jobposting_page.html"),
  "utf-8",
);
const headless = process.env.PLAYWRIGHT_HEADLESS === "1";

test("shows page score UI for JobPosting JSON-LD", async () => {
  test.setTimeout(60_000);
  const extensionPath = resolve("dist");
  const userDataDir = mkdtempSync(join(process.cwd(), ".pw-user-data-"));
  const crashpadDir = join(process.cwd(), ".pw-crashpad");
  mkdirSync(crashpadDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--crash-dumps-dir=${crashpadDir}`,
      "--disable-crashpad",
      "--disable-crash-reporter",
    ],
  });

  await context.route("https://example.com/job*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: fixtureHtml,
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

  await context.route("http://localhost:8787/api/employer/resolve*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [
          {
            company_number: "001",
            title: "Acme Ltd",
            status: "active",
            address_snippet: "London",
            sic_codes: ["62020"],
            score: 0.92,
            reasons: ["exact_normalized_match"],
          },
        ],
        cached: false,
      }),
    });
  });

  await context.route("http://localhost:8787/api/employer/signals*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        company_number: "001",
        sic_codes: ["62020"],
        sector_intensity_band: "low",
        sector_intensity_value: 0.42,
        sources: ["companies_house", "ons"],
        cached: false,
      }),
    });
  });

  const page = await context.newPage();
  await page.goto("https://example.com/job?id=1", { waitUntil: "domcontentloaded" });

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

  const pill = page.locator(".carbonrank-page-score__pill");
  await expect(pill).toBeVisible();

  await pill.click();

  const panel = page.locator(".carbonrank-page-score__panel");
  await expect(panel).toBeVisible();

  const scoreValue = page.locator(".carbonrank-page-score__score-value");
  await expect(scoreValue).toContainText("kgCO2e/yr");

  const employerStatus = page.locator(".carbonrank-page-score__employer-status");
  await expect(employerStatus).toContainText("Employer signals");

  await context.close();
});
