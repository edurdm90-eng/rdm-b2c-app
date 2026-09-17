import app from "../dist/vercel.mjs";
import { sendWebResponse, toWebRequest } from "./_request.js";
import type { ServerResponse } from "node:http";

export default async function handler(
  request: Parameters<typeof toWebRequest>[0],
  response: ServerResponse,
) {
  const pathname = request.url?.split("?", 1)[0]?.slice("/api".length) || "/";
  await sendWebResponse(await app.fetch(toWebRequest(request, pathname)), response);
}
