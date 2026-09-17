import app from "../../../dist/vercel.mjs";
import { sendWebResponse, toWebRequest } from "../../_request.js";
import type { ServerResponse } from "node:http";

export default async function handler(
  request: Parameters<typeof toWebRequest>[0],
  response: ServerResponse,
) {
  await sendWebResponse(await app.fetch(toWebRequest(request)), response);
}
