import { protectedProcedure, publicProcedure, router } from "../index";
import { rdmRouter } from "./rdm";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  rdm: rdmRouter,
});
export type AppRouter = typeof appRouter;
