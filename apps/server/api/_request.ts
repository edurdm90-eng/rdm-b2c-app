import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

type VercelRequest = IncomingMessage & {
  url?: string;
};

export function toWebRequest(request: VercelRequest, pathname?: string) {
  const protocol = getHeader(request, "x-forwarded-proto") ?? "https";
  const host =
    getHeader(request, "x-forwarded-host") ?? getHeader(request, "host");

  if (!host) {
    throw new Error("Vercel request is missing a host header");
  }

  const url = new URL(request.url ?? "/", `${protocol}://${host}`);
  if (pathname) {
    url.pathname = pathname;
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const method = request.method ?? "GET";
  const body = method === "GET" || method === "HEAD"
    ? undefined
    : Readable.toWeb(request as Readable) as ReadableStream;

  return new Request(url, {
    method,
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function getHeader(request: VercelRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
