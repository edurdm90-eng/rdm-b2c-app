import app from "../../dist/vercel.mjs";
import { toWebRequest } from "../_request.js";
import { sendWebResponse } from "../_request.js";
import type { ServerResponse } from "node:http";

export default async function handler(
  request: Parameters<typeof toWebRequest>[0],
  response: ServerResponse,
) {
  await sendWebResponse(await app.fetch(await toWebRequest(request)), response);
}
