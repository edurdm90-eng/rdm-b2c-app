import app from "../dist/vercel.mjs";

export default async function handler(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/";
  return app.fetch(new Request(url, request));
}
