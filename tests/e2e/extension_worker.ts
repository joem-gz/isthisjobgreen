import type { BrowserContext, Worker } from "@playwright/test";

const EXTENSION_WORKER_TIMEOUT_MS = 15_000;

export async function waitForExtensionWorker(
  context: BrowserContext,
): Promise<Worker> {
  return (
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", {
      timeout: EXTENSION_WORKER_TIMEOUT_MS,
    }))
  );
}
