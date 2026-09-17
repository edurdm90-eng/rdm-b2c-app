import { auth } from "@rdm-b2c/auth";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    // Use Hono's request API instead of the raw Web Request. This keeps the
    // workspace build independent of which Request type Vercel resolves.
    headers: context.req.header(),
  });
  return {
    auth: null,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
