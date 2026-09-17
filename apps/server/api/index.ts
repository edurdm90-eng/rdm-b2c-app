import app from "../dist/vercel.mjs";

export default async function handler(request: Request) {
  const origin = getRequestOrigin(request);
  const url = new URL(request.url, origin);
  url.pathname = "/";
  return app.fetch(new Request(url, request));
}

function getRequestOrigin(request: Request) {
  const protocol = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!host) {
    throw new Error("Vercel request is missing a host header");
  }

  return `${protocol}://${host}`;
}
