import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  challengeAttempts,
  InsertUser,
  learnerAchievements,
  learnerStats,
  learningActivity,
  lessonProgress,
  trackEnrollments,
  users,
} from "../drizzle/schema";
import { challengeOutcome, lessonCompletionOutcome, projectCompletionOutcome } from "../shared/progress";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    const value = user[field];
    if (value !== undefined) { values[field] = value ?? null; updateSet[field] = value ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getLearnerDashboard(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [stats] = await db.select().from(learnerStats).where(eq(learnerStats.userId, userId)).limit(1);
  const progress = await db.select().from(lessonProgress).where(eq(lessonProgress.userId, userId));
  const activity = await db.select().from(learningActivity).where(eq(learningActivity.userId, userId)).orderBy(desc(learningActivity.createdAt)).limit(6);
  const achievements = await db.select().from(learnerAchievements).where(eq(learnerAchievements.userId, userId));
  const enrollments = await db.select().from(trackEnrollments).where(eq(trackEnrollments.userId, userId));
  return { stats: stats ?? { xp: 0, streak: 0, completedLessons: 0 }, progress, activity, achievements, enrollments };
}

export async function getLearnerProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const dashboard = await getLearnerDashboard(userId);
  return { user, ...dashboard };
}

export async function enrollInTrack(input: { userId: number; trackId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(trackEnrollments).values({ userId: input.userId, trackId: input.trackId }).onDuplicateKeyUpdate({ set: { enrolledAt: new Date() } });
  await db.insert(learningActivity).values({ userId: input.userId, type: "enrollment", title: "Track added", detail: `Added the ${input.trackId.toUpperCase()} track to your learning path.` });
  return { enrolled: true, trackId: input.trackId };
}

export async function completeLesson(input: { userId: number; lessonId: string; track: "HTML" | "CSS" | "JavaScript"; difficulty: "Beginner" | "Intermediate" | "Advanced"; xp: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [existing] = await db.select().from(lessonProgress).where(and(eq(lessonProgress.userId, input.userId), eq(lessonProgress.lessonId, input.lessonId))).limit(1);
  const alreadyComplete = existing?.status === "completed";
  const outcome = lessonCompletionOutcome(alreadyComplete, input.xp);
  await db.insert(lessonProgress).values({ userId: input.userId, lessonId: input.lessonId, track: input.track, difficulty: input.difficulty, status: "completed", xpEarned: input.xp, score: 100, completedAt: new Date() }).onDuplicateKeyUpdate({ set: { status: "completed", xpEarned: input.xp, score: 100, completedAt: new Date() } });
  if (outcome.shouldRecordActivity) {
    await db.insert(learnerStats).values({ userId: input.userId, xp: outcome.awardedXp, streak: 1, completedLessons: 1, lastActivityAt: new Date() }).onDuplicateKeyUpdate({ set: { xp: sql`${learnerStats.xp} + ${outcome.awardedXp}`, completedLessons: sql`${learnerStats.completedLessons} + 1`, streak: sql`GREATEST(${learnerStats.streak}, 1)`, lastActivityAt: new Date() } });
    await db.insert(learningActivity).values({ userId: input.userId, type: "lesson", title: "Lesson completed", detail: `Completed ${input.lessonId.replace(/-/g, " ")}.` });
    await db.insert(learnerAchievements).values({ userId: input.userId, achievementId: "first-spark" }).onDuplicateKeyUpdate({ set: { earnedAt: new Date() } });
  }
  return { completed: true, isNewCompletion: !alreadyComplete, awardedXp: outcome.awardedXp };
}

export async function recordChallengeAttempt(input: { userId: number; challengeId: string; score: number; passed: boolean; summary: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const outcome = challengeOutcome(input.passed);
  await db.insert(challengeAttempts).values(input);
  await db.insert(learningActivity).values({ userId: input.userId, type: "challenge", title: input.passed ? "Challenge passed" : "Challenge attempted", detail: input.summary });
  if (outcome.awardedXp > 0) await db.insert(learnerStats).values({ userId: input.userId, xp: outcome.awardedXp, streak: 1, completedLessons: 0, lastActivityAt: new Date() }).onDuplicateKeyUpdate({ set: { xp: sql`${learnerStats.xp} + ${outcome.awardedXp}`, lastActivityAt: new Date() } });
  return { saved: true, awardedXp: outcome.awardedXp };
}

export async function recordProjectCompletion(input: { userId: number; projectId: string; title: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const outcome = projectCompletionOutcome();
  await db.insert(learnerAchievements).values({ userId: input.userId, achievementId: outcome.achievementId }).onDuplicateKeyUpdate({ set: { earnedAt: new Date() } });
  await db.insert(learnerStats).values({ userId: input.userId, xp: outcome.awardedXp, streak: 1, completedLessons: 0, lastActivityAt: new Date() }).onDuplicateKeyUpdate({ set: { xp: sql`${learnerStats.xp} + ${outcome.awardedXp}`, lastActivityAt: new Date() } });
  await db.insert(learningActivity).values({ userId: input.userId, type: "project", title: "Project completed", detail: `Completed the ${input.title} project.` });
  return { saved: true, projectId: input.projectId, awardedXp: outcome.awardedXp };
}
