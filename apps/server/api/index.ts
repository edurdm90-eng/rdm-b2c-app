import { toWebRequest } from "./_request.js";

export default async function handler(request: Parameters<typeof toWebRequest>[0]) {
  const pathname = request.url?.split("?", 1)[0] ?? "/";
  if (pathname === "/" || pathname === "/api") {
    return new Response("OK");
  }

  const { default: app } = await import("../dist/vercel.mjs");
  return app.fetch(toWebRequest(request, pathname));
}
