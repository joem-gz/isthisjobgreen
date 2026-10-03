import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createProxyServer } from "../../server/index";

const servers: ReturnType<typeof createProxyServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          if (!server.listening) {
            resolve();
            return;
          }
          server.close(() => resolve());
        }),
    ),
  );
});

async function startTestServer(allowedOrigins: string[] = []) {
  const server = createProxyServer({
    host: "127.0.0.1",
    port: 0,
    allowedOrigins,
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("provider proxy HTTP boundary", () => {
  it("does not emit wildcard CORS or allow an unconfigured origin", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/jobs/search`, {
      headers: { Origin: "https://attacker.example" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows an exact configured origin and keeps originless requests local", async () => {
    const baseUrl = await startTestServer(["http://localhost:3000"]);
    const allowed = await fetch(`${baseUrl}/api/jobs/search`, {
      headers: { Origin: "http://localhost:3000" },
    });
    const originless = await fetch(`${baseUrl}/api/jobs/search`);

    expect(allowed.status).toBe(500);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(originless.status).toBe(500);
    expect(originless.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects disallowed preflight requests", async () => {
    const baseUrl = await startTestServer(["http://localhost:3000"]);
    const response = await fetch(`${baseUrl}/api/jobs/search`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://attacker.example",
        "Access-Control-Request-Method": "GET",
      },
    });

    expect(response.status).toBe(403);
  });
});
