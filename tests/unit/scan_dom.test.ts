import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { scanAndAnnotate, observeMutations } from "../../src/content/scan";
import { Settings } from "../../src/storage/settings";

const settings: Settings = {
  homePostcode: "SW1A 1AA",
  commuteMode: "car",
  officeDaysPerWeek: 3,
};

const sendMessage = vi.fn((message, callback) => {
  callback({
    type: "score_response",
    requestId: message.requestId,
    result: { status: "no_data", reason: "Test" },
  });
});
const fetchEmployerStatus = vi.fn().mockResolvedValue("no_data");

function loadFixture(path: string): Document {
  const url = new URL(path, import.meta.url);
  const html = readFileSync(url, "utf-8");
  return new DOMParser().parseFromString(html, "text/html");
}

function setupChromeMock() {
  vi.stubGlobal("chrome", {
    runtime: {
      lastError: undefined,
    },
  });
}

describe("scanAndAnnotate", () => {
  it("annotates new cards once after DOM mutations", async () => {
    setupChromeMock();
    const doc = new DOMParser().parseFromString(
      "<!doctype html><body><div id='root'></div></body>",
      "text/html",
    );
    const root = doc.getElementById("root");
    if (!root) {
      throw new Error("Missing root element");
    }

    observeMutations(root, () =>
      scanAndAnnotate(doc, settings, {
        sendMessage,
        createRequestId: () => "id-1",
        fetchEmployerStatus,
      }),
    );

    root.innerHTML = `
      <div class="job-card_jobCard__body__86jgk card-body">
        <h2>
          <a href="/jobs/example/123" data-qa="job-card-title">Example Job</a>
        </h2>
        <ul>
          <li data-qa="job-card-location">London</li>
        </ul>
      </div>
    `;

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(doc.querySelectorAll("[data-carbonrank-badge]")).toHaveLength(1);

    root.appendChild(doc.createElement("span"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(doc.querySelectorAll("[data-carbonrank-badge]")).toHaveLength(1);
  });

  it("skips cards that look like courses", () => {
    setupChromeMock();
    const doc = loadFixture("../fixtures/reed_search_results_courses.html");

    scanAndAnnotate(doc, settings, {
      sendMessage,
      createRequestId: () => "id-2",
      fetchEmployerStatus,
    });

    expect(doc.querySelectorAll("[data-carbonrank-badge]")).toHaveLength(0);
  });
});
