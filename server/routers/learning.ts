import { learnerIdOf } from "../learner";
import { CURRICULUM, PROJECTS } from "@shared/curriculum";
import { z } from "zod";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { completeBeginnerBuildMission, completeDailyLearningTask, completeSupabaseLesson, enrollSupabaseTrack, getDailyLearningOverview, getSupabaseLearnerDashboard, verifyFullAccess, recordSupabaseChallengeAttempt, recordSupabaseProjectCompletion, reconcileXpTotal } from "../supabaseLearning";
import { lessonRequiresFullAccess } from "../../shared/fullAccess";
import { offsetMinutesOf } from "../utcOffset";

const lessonInput = z.object({
  lessonId: z.string().min(1).max(80),
  track: z.enum(["HTML", "CSS", "JavaScript"]),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  xp: z.number().int().min(0).max(250),
});

async function requireLessonAccess(userId: string, lessonId: string) {
  const lesson = CURRICULUM.flatMap(track => track.lessons).find(item => item.id === lessonId);
  if (!lesson || !lessonRequiresFullAccess(lesson.order)) return;
  const access = await verifyFullAccess(userId);
  if (!access.hasFullAccess) throw new Error("This lesson is part of Full Access. Choose a plan to continue.");
}

export const learningRouter = router({
  catalog: publicProcedure.query(() => ({ tracks: CURRICULUM, projects: PROJECTS })),
  dashboard: protectedProcedure.query(async ({ ctx }) => getSupabaseLearnerDashboard(learnerIdOf(ctx.user), offsetMinutesOf(ctx.req))),
  dailyOverview: protectedProcedure.query(async ({ ctx }) => getDailyLearningOverview(learnerIdOf(ctx.user), offsetMinutesOf(ctx.req))),
  completeDailyTask: protectedProcedure.input(z.object({ score: z.number().int().min(0).max(100), submittedCode: z.object({ html: z.string().max(20_000).optional(), css: z.string().max(20_000).optional(), javascript: z.string().max(20_000).optional() }).optional() })).mutation(async ({ ctx, input }) => completeDailyLearningTask(learnerIdOf(ctx.user), offsetMinutesOf(ctx.req), input)),
  completeBeginnerMission: protectedProcedure.input(z.object({ missionId: z.string().min(1).max(40), code: z.string().min(1).max(20_000) })).mutation(async ({ ctx, input }) => completeBeginnerBuildMission(learnerIdOf(ctx.user), offsetMinutesOf(ctx.req), input)),
  profile: protectedProcedure.query(async ({ ctx }) => getSupabaseLearnerDashboard(learnerIdOf(ctx.user), offsetMinutesOf(ctx.req))),
  enrollTrack: protectedProcedure
    .input(z.object({ trackId: z.string().refine(value => ["html", "css", "javascript"].includes(value), "Unknown track") }))
    .mutation(async ({ ctx, input }) => enrollSupabaseTrack(learnerIdOf(ctx.user), input.trackId)),
  completeLesson: protectedProcedure.input(lessonInput).mutation(async ({ ctx, input }) => {
    const lesson = CURRICULUM.flatMap(track => track.lessons).find(item => item.id === input.lessonId);
    if (!lesson) throw new Error("Lesson is not available yet");
    await requireLessonAccess(learnerIdOf(ctx.user), input.lessonId);
    return completeSupabaseLesson(learnerIdOf(ctx.user), offsetMinutesOf(ctx.req), { ...input, xp: lesson.xp });
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
    .mutation(async ({ ctx, input }) => { await requireLessonAccess(learnerIdOf(ctx.user), input.challengeId); return recordSupabaseChallengeAttempt(learnerIdOf(ctx.user), offsetMinutesOf(ctx.req), input); }),
  completeProject: protectedProcedure
    .input(z.object({ projectId: z.string().min(1).max(80), title: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => recordSupabaseProjectCompletion(learnerIdOf(ctx.user), offsetMinutesOf(ctx.req), input)),
  /**
   * Detect and correct a diverged XP cache, for an operator (spec stories 23
   * and 24).
   *
   * A mutation rather than a query because it writes when it finds divergence,
   * and it names the Learner explicitly rather than reading one from the
   * session: an operator reconciles somebody else's total, never their own.
   *
   * Admin-gated for the same reason it is not a query. It cannot invent a
   * number - the correction is always the ledger's own sum - so the worst a
   * caller can do is force a recompute. That is still an operator action, and
   * the Learner id it takes is enough to enumerate accounts with.
   */
  adminReconcileXp: adminProcedure
    .input(z.object({ learnerId: z.string().min(1).max(80) }))
    .mutation(async ({ input }) => reconcileXpTotal(input.learnerId)),
});
