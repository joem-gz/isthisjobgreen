import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { init } from "../../widget/src/index";

function loadFixture(path: string): Document {
  const html = readFileSync(resolve("tests", "fixtures", path), "utf-8");
  return new DOMParser().parseFromString(html, "text/html");
}

const cardOptions = {
  apiBaseUrl: "/api/widget/score",
  cardSelector: ".job-card",
  fields: {
    employer: ".job-card__employer",
    location: ".job-card__location",
    link: ".job-card__link",
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("widget job cards", () => {
  it("renders card widgets using configured selectors", async () => {
    const doc = loadFixture("widget_cards_initial.html");
    const mutationHtml = readFileSync(
      resolve("tests", "fixtures", "widget_cards_mutation.html"),
      "utf-8",
    );
    doc.body?.insertAdjacentHTML("beforeend", mutationHtml);

    const fetchMock = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({ status: "ok", score: 88 }),
      }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    init({ doc, ...cardOptions });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const badges = doc.querySelectorAll(".job-card .carbonrank-widget__badge");
    expect(badges).toHaveLength(2);
    expect(badges[0]?.textContent).toBe("88 kgCO2e/yr");
  });

  it("adds widgets for new cards without duplicating", async () => {
    const doc = loadFixture("widget_cards_initial.html");
    const fetchMock = vi.fn(async () =>
      ({
        ok: true,
        json: async () => ({ status: "ok", score: 76 }),
      }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    init({ doc, ...cardOptions });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const mutationHtml = readFileSync(
      resolve("tests", "fixtures", "widget_cards_mutation.html"),
      "utf-8",
    );
    doc.body?.insertAdjacentHTML("beforeend", mutationHtml);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const badges = doc.querySelectorAll(".job-card .carbonrank-widget__badge");
    expect(badges).toHaveLength(2);

    const hosts = doc.querySelectorAll(".job-card [data-carbonrank-card-host]");
    expect(hosts).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
