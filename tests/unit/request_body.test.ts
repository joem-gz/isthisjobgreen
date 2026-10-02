import { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  isJsonContentType,
  readJsonBody,
  RequestBodyError,
} from "../../server/request_body";

function buildRequest(body: string, contentLength?: number): IncomingMessage {
  const request = Readable.from([body]) as IncomingMessage;
  Object.defineProperty(request, "headers", {
    value: contentLength === undefined ? {} : { "content-length": String(contentLength) },
  });
  return request;
}

describe("JSON request bodies", () => {
  it("recognizes JSON media types", () => {
    expect(isJsonContentType("application/json; charset=utf-8")).toBe(true);
    expect(isJsonContentType("application/problem+json")).toBe(true);
    expect(isJsonContentType("text/plain")).toBe(false);
    expect(isJsonContentType(undefined)).toBe(false);
  });

  it("parses a body within the configured limit", async () => {
    await expect(readJsonBody(buildRequest('{"ok":true}'), 64)).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects a declared oversized body", async () => {
    await expect(readJsonBody(buildRequest("{}", 100), 16)).rejects.toMatchObject({
      statusCode: 413,
    } satisfies Partial<RequestBodyError>);
  });

  it("rejects a streamed oversized body", async () => {
    await expect(readJsonBody(buildRequest("x".repeat(17)), 16)).rejects.toMatchObject({
      statusCode: 413,
    } satisfies Partial<RequestBodyError>);
  });

  it("rejects malformed JSON", async () => {
    await expect(readJsonBody(buildRequest("{"), 16)).rejects.toMatchObject({
      statusCode: 400,
    } satisfies Partial<RequestBodyError>);
  });
});
