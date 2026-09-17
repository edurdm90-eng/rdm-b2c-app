import app from "../../dist/vercel.mjs";

export default async function handler(request: Request) {
  return app.fetch(request);
}
