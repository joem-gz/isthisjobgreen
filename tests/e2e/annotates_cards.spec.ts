import { readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test, expect, chromium } from "@playwright/test";
import { waitForExtensionWorker } from "./extension_worker";

const fixtureHtml = readFileSync(
  resolve("tests/fixtures/reed_search_results_e2e.html"),
  "utf-8",
);
const modalHtml = readFileSync(
  resolve("tests/fixtures/reed_job_details_drawer_modal.html"),
  "utf-8",
);
const headless = process.env.PLAYWRIGHT_HEADLESS === "1";

test("annotates Reed cards with expected badge states", async () => {
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

  await context.route("https://www.reed.co.uk/jobs*", async (route) => {
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

  const page = await context.newPage();
  await page.goto("https://www.reed.co.uk/jobs?e2e=1", {
    waitUntil: "domcontentloaded",
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

  const badges = page.locator("[data-carbonrank-badge]");
  await expect(badges).toHaveCount(3);

  await expect(badges.nth(0)).toContainText("kgCO2e/yr");
  await expect(badges.nth(1)).toHaveText("0 kgCO2e/yr");
  await expect(badges.nth(2)).toHaveText("No data");

  const pill = page.locator(".carbonrank-page-score__pill");
  await expect(pill).toHaveCount(0);

  await page.evaluate((html) => {
    const root = document.getElementById("modal-root") ?? document.body;
    root.insertAdjacentHTML("beforeend", html);
  }, modalHtml);

  await expect(pill).toBeVisible();
  await expect(badges).toHaveCount(3);

  await context.close();
});
