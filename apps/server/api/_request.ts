import type { IncomingMessage, ServerResponse } from "node:http";

type VercelRequest = IncomingMessage & {
  url?: string;
};

export async function toWebRequest(request: VercelRequest, pathname?: string) {
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
    : await readBody(request);

  return new Request(url, {
    method,
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

async function readBody(request: VercelRequest) {
  const chunks: Buffer[] = [];
  for await (const chunk of request as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function sendWebResponse(
  response: Response,
  destination: ServerResponse,
) {
  destination.statusCode = response.status;

  const setCookie = (
    response.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie?.() ?? (() => {
    const combined = response.headers.get("set-cookie");
    return combined ? [combined] : [];
  })();

  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") {
      destination.setHeader(name, value);
    }
  });
  if (setCookie?.length) {
    destination.setHeader("set-cookie", setCookie);
  }

  destination.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
}

function getHeader(request: VercelRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
