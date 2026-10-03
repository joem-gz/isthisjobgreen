import { IncomingMessage } from "node:http";

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 32 * 1024;

export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "RequestBodyError";
  }
}

export function isJsonContentType(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

export async function readJsonBody(
  request: IncomingMessage,
  maxBytes: number = DEFAULT_JSON_BODY_LIMIT_BYTES,
): Promise<unknown> {
  const contentLength = Number.parseInt(request.headers["content-length"] ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    request.resume();
    throw new RequestBodyError("Request body too large", 413);
  }

  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;
    if (receivedBytes > maxBytes) {
      request.resume();
      throw new RequestBodyError("Request body too large", 413);
    }
    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString("utf-8").trim();
  if (!body) {
    return {};
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new RequestBodyError("Invalid JSON body", 400);
  }
}
