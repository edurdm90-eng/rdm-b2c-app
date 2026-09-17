import app from "../dist/vercel.mjs";

export default async function handler(request) {
  const url = new URL(request.url);

  if (url.pathname === "/api") {
    url.pathname = "/";
  } else if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/")) {
    url.pathname = url.pathname.slice("/api".length);
  }

  return app.fetch(new Request(url, request));
}
