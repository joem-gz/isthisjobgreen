import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const distDir = resolve("dist");
const manifestPath = resolve(distDir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const requiredFiles = new Set([
  "manifest.json",
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  "content_script.js",
  "pages/search/search.html",
  "pages/search/search.js",
]);

for (const contentScript of manifest.content_scripts ?? []) {
  for (const script of contentScript.js ?? []) {
    requiredFiles.add(script);
  }
}

for (const file of requiredFiles) {
  if (typeof file !== "string" || !file) {
    throw new Error("Extension manifest is missing a required packaged path");
  }
  await access(resolve(distDir, file));
}

console.log(`Verified ${requiredFiles.size} required extension package files.`);
