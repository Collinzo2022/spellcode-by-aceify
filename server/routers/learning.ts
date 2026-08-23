import { learnerIdOf } from "../learner";
import { CURRICULUM, PROJECTS } from "@shared/curriculum";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { completeBeginnerBuildMission, completeDailyLearningTask, completeSupabaseLesson, enrollSupabaseTrack, getDailyLearningOverview, getSupabaseLearnerDashboard, getVerifiedEntitlements, recordSupabaseChallengeAttempt, recordSupabaseProjectCompletion } from "../supabaseLearning";
import { lessonRequiresFullAccess } from "../../shared/entitlements";

const lessonInput = z.object({
  lessonId: z.string().min(1).max(80),
  track: z.enum(["HTML", "CSS", "JavaScript"]),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  xp: z.number().int().min(0).max(250),
});

async function requireLessonAccess(userId: string, lessonId: string) {
  const lesson = CURRICULUM.flatMap(track => track.lessons).find(item => item.id === lessonId);
  if (!lesson || !lessonRequiresFullAccess(lesson.order)) return;
  const entitlement = await getVerifiedEntitlements(userId);
  if (!entitlement.hasFullAccess) throw new Error("This lesson is part of Full Access. Choose a plan to continue.");
}

export const learningRouter = router({
  catalog: publicProcedure.query(() => ({ tracks: CURRICULUM, projects: PROJECTS })),
  dashboard: protectedProcedure.query(async ({ ctx }) => getSupabaseLearnerDashboard(learnerIdOf(ctx.user))),
  dailyOverview: protectedProcedure.query(async ({ ctx }) => getDailyLearningOverview(learnerIdOf(ctx.user))),
  completeDailyTask: protectedProcedure.input(z.object({ score: z.number().int().min(0).max(100), submittedCode: z.object({ html: z.string().max(20_000).optional(), css: z.string().max(20_000).optional(), javascript: z.string().max(20_000).optional() }).optional() })).mutation(async ({ ctx, input }) => completeDailyLearningTask(learnerIdOf(ctx.user), input)),
  completeBeginnerMission: protectedProcedure.input(z.object({ missionId: z.string().min(1).max(40), code: z.string().min(1).max(20_000) })).mutation(async ({ ctx, input }) => completeBeginnerBuildMission(learnerIdOf(ctx.user), input)),
  profile: protectedProcedure.query(async ({ ctx }) => getSupabaseLearnerDashboard(learnerIdOf(ctx.user))),
  enrollTrack: protectedProcedure
    .input(z.object({ trackId: z.string().refine(value => ["html", "css", "javascript"].includes(value), "Unknown track") }))
    .mutation(async ({ ctx, input }) => enrollSupabaseTrack(learnerIdOf(ctx.user), input.trackId)),
  completeLesson: protectedProcedure.input(lessonInput).mutation(async ({ ctx, input }) => {
    await requireLessonAccess(learnerIdOf(ctx.user), input.lessonId);
    return completeSupabaseLesson(learnerIdOf(ctx.user), input);
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
    .mutation(async ({ ctx, input }) => { await requireLessonAccess(learnerIdOf(ctx.user), input.challengeId); return recordSupabaseChallengeAttempt(learnerIdOf(ctx.user), input); }),
  completeProject: protectedProcedure
    .input(z.object({ projectId: z.string().min(1).max(80), title: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => recordSupabaseProjectCompletion(learnerIdOf(ctx.user), input)),
});
