import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { learningRouter } from "./routers/learning";
import { getSupabasePublicConfig } from "./supabase";
import { billingRouter } from "./routers/billing";
import { tutorRouter } from "./routers/tutor";
import { certificatesRouter } from "./routers/certificates";
import { projectsRouter } from "./routers/projects";
import { availabilityRouter } from "./routers/availability";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    supabaseConfig: publicProcedure.query(() => getSupabasePublicConfig()),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  learning: learningRouter,
  billing: billingRouter,
  tutor: tutorRouter,
  certificates: certificatesRouter,
  projects: projectsRouter,
  availability: availabilityRouter,
});

export type AppRouter = typeof appRouter;
