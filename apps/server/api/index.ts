import { toWebRequest } from "./_request.js";
import { sendWebResponse } from "./_request.js";
import type { ServerResponse } from "node:http";

export default async function handler(
  request: Parameters<typeof toWebRequest>[0],
  response: ServerResponse,
) {
  const pathname = request.url?.split("?", 1)[0] ?? "/";
  const appPathname = pathname === "/api" ? "/" : pathname;
  const { default: app } = await import("../dist/vercel.mjs");
  await sendWebResponse(await app.fetch(await toWebRequest(request, appPathname)), response);
}
