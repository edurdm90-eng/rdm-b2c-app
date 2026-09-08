import { protectedProcedure, publicProcedure, router } from "../index";
import { rdmRouter } from "./rdm";
import { medaaRouter } from "./medaa";

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
  medaa: medaaRouter,
});
export type AppRouter = typeof appRouter;
