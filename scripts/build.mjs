import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import esbuild from "esbuild";

const distDir = resolve("dist");
const LOCATION_INDEX = "src/data/uk_places_index.json";
const NON_WORKER_BUDGET_BYTES = 1_000_000;
const SERVICE_WORKER_BUDGET_BYTES = 8_000_000;

const shared = {
  bundle: true,
  sourcemap: true,
  outdir: distDir,
  outbase: "src",
  loader: {
    ".css": "text",
    ".json": "json",
  },
};

function includesLocationIndex(result) {
  return Object.keys(result.metafile.inputs).some((input) => input.endsWith(LOCATION_INDEX));
}

function outputBytes(result, outputPath) {
  const entry = Object.entries(result.metafile.outputs).find(([path]) =>
    path.endsWith(outputPath),
  );
  if (!entry) {
    throw new Error(`Build did not produce ${outputPath}`);
  }
  return entry[1].bytes;
}

function verifyEntry(result, name, outputPath, shouldContainIndex, budgetBytes) {
  const containsIndex = includesLocationIndex(result);
  if (containsIndex !== shouldContainIndex) {
    throw new Error(
      `${name} ${containsIndex ? "unexpectedly contains" : "does not contain"} the location index`,
    );
  }
  const bytes = outputBytes(result, outputPath);
  if (bytes > budgetBytes) {
    throw new Error(`${name} is ${bytes} bytes, exceeding its ${budgetBytes}-byte budget`);
  }
  console.log(`${name}: ${bytes} bytes; location index: ${containsIndex ? "yes" : "no"}`);
}

async function build() {
  await mkdir(distDir, { recursive: true });

  const contentScript = await esbuild.build({
    entryPoints: ["src/content_script.ts"],
    format: "iife",
    platform: "browser",
    metafile: true,
    ...shared,
  });

  const serviceWorker = await esbuild.build({
    entryPoints: ["src/service_worker.ts"],
    format: "esm",
    platform: "browser",
    metafile: true,
    ...shared,
  });

  const popup = await esbuild.build({
    entryPoints: ["src/popup/popup.ts"],
    format: "iife",
    platform: "browser",
    metafile: true,
    ...shared,
  });

  const search = await esbuild.build({
    entryPoints: ["src/pages/search/search.ts"],
    format: "iife",
    platform: "browser",
    metafile: true,
    ...shared,
  });

  verifyEntry(
    contentScript,
    "content script",
    "dist/content_script.js",
    false,
    NON_WORKER_BUDGET_BYTES,
  );
  verifyEntry(
    serviceWorker,
    "service worker",
    "dist/service_worker.js",
    true,
    SERVICE_WORKER_BUDGET_BYTES,
  );
  verifyEntry(popup, "popup", "dist/popup/popup.js", false, NON_WORKER_BUDGET_BYTES);
  verifyEntry(
    search,
    "search page",
    "dist/pages/search/search.js",
    false,
    NON_WORKER_BUDGET_BYTES,
  );

  await copyFile("src/manifest.json", "dist/manifest.json");
  await mkdir(resolve(distDir, "popup"), { recursive: true });
  await copyFile("src/popup/popup.html", "dist/popup/popup.html");
  await copyFile("src/popup/popup.css", "dist/popup/popup.css");
  await mkdir(resolve(distDir, "pages", "search"), { recursive: true });
  await copyFile(
    "src/pages/search/search.html",
    "dist/pages/search/search.html",
  );
  await copyFile(
    "src/pages/search/search.css",
    "dist/pages/search/search.css",
  );
  await mkdir(resolve(distDir, "pages", "help"), { recursive: true });
  await copyFile("src/pages/help/help.html", "dist/pages/help/help.html");
  await copyFile("src/pages/help/help.css", "dist/pages/help/help.css");
  await mkdir(resolve(distDir, "help"), { recursive: true });
  await copyFile("src/pages/help/help.html", "dist/help/index.html");
  await copyFile("src/pages/help/help.css", "dist/help/help.css");
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
