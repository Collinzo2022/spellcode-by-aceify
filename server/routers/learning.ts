import { CURRICULUM, PROJECTS } from "@shared/curriculum";
import { z } from "zod";
import * as db from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const lessonInput = z.object({
  lessonId: z.string().min(1).max(80),
  track: z.enum(["HTML", "CSS", "JavaScript"]),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  xp: z.number().int().min(0).max(250),
});

export const learningRouter = router({
  catalog: publicProcedure.query(() => ({ tracks: CURRICULUM, projects: PROJECTS })),
  dashboard: protectedProcedure.query(async ({ ctx }) => db.getLearnerDashboard(ctx.user.id)),
  profile: protectedProcedure.query(async ({ ctx }) => db.getLearnerProfile(ctx.user.id)),
  enrollTrack: protectedProcedure
    .input(z.object({ trackId: z.string().refine(value => ["html", "css", "javascript"].includes(value), "Unknown track") }))
    .mutation(async ({ ctx, input }) => db.enrollInTrack({ userId: ctx.user.id, ...input })),
  completeLesson: protectedProcedure.input(lessonInput).mutation(async ({ ctx, input }) => {
    return db.completeLesson({ userId: ctx.user.id, ...input });
  }),
  submitChallenge: protectedProcedure
    .input(
      z.object({
        challengeId: z.string().min(1).max(80),
        score: z.number().int().min(0).max(100),
        passed: z.boolean(),
        summary: z.string().min(1).max(280),
      }),
    )
    .mutation(async ({ ctx, input }) => db.recordChallengeAttempt({ userId: ctx.user.id, ...input })),
  completeProject: protectedProcedure
    .input(z.object({ projectId: z.string().min(1).max(80), title: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => db.recordProjectCompletion({ userId: ctx.user.id, ...input })),
});
