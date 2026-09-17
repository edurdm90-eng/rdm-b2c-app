import app from "../dist/vercel.mjs";
import { toWebRequest } from "./_request";

export default async function handler(request: Parameters<typeof toWebRequest>[0]) {
  return app.fetch(toWebRequest(request, "/"));
}
