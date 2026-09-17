import { toWebRequest } from "./_request.js";
import { sendWebResponse } from "./_request.js";
import type { ServerResponse } from "node:http";

export default async function handler(
  request: Parameters<typeof toWebRequest>[0],
  response: ServerResponse,
) {
  const pathname = request.url?.split("?", 1)[0] ?? "/";
  if (pathname === "/" || pathname === "/api") {
    response.statusCode = 200;
    response.setHeader("content-type", "text/plain; charset=UTF-8");
    response.end("OK");
    return;
  }

  const { default: app } = await import("../dist/vercel.mjs");
  await sendWebResponse(await app.fetch(await toWebRequest(request, pathname)), response);
}
