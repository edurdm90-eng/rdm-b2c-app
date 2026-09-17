import app from "../../dist/vercel.mjs";
import { toWebRequest } from "../_request";

export default async function handler(request: Parameters<typeof toWebRequest>[0]) {
  const pathname = request.url?.split("?", 1)[0]?.slice("/api".length) || "/";
  return app.fetch(toWebRequest(request, pathname));
}
