import { offsetMinutesOf } from "./utcOffset";
import { learnerIdOf } from "./learner";
import type { Express, Request, Response } from "express";
import { completeDailyLearningTask, completeSupabaseLesson, getDailyLearningOverview, verifyFullAccess } from "./supabaseLearning";
import { getSupabasePublicConfig, getSupabaseSessionUser, supabaseAdminRequest } from "./supabase";
import { CURRICULUM } from "../shared/curriculum";

async function mobileUser(req: Request) {
  const authorization = req.header("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return token ? getSupabaseSessionUser(token) : null;
}

export function registerMobileRoutes(app: Express) {
  // The public Supabase settings, served from the same source as the web's
  // auth.supabaseConfig so the two cannot drift. Asked for before anyone can
  // have signed in, so it takes no bearer token. The anon key is public by
  // design; the service-role key and the Paystack secret must never appear here.
  app.get("/api/mobile/config", (_req: Request, res: Response) => {
    try { const { url, anonKey } = getSupabasePublicConfig(); return res.json({ supabaseUrl: url, supabaseAnonKey: anonKey }); } catch { return res.status(503).json({ error: "Supabase configuration is unavailable" }); }
  });
  app.get("/api/mobile/curriculum", (_req: Request, res: Response) => res.json({ tracks: CURRICULUM }));
  app.get("/api/mobile/daily", async (req: Request, res: Response) => {
    const user = await mobileUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    try { return res.json(await getDailyLearningOverview(learnerIdOf(user), offsetMinutesOf(req))); } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load daily practice" }); }
  });
  app.get("/api/mobile/access", async (req: Request, res: Response) => {
    const user = await mobileUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    try { return res.json(await verifyFullAccess(learnerIdOf(user))); } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load access" }); }
  });
  app.get("/api/mobile/profile", async (req: Request, res: Response) => {
    const user = await mobileUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    try {
      const [daily, access] = await Promise.all([getDailyLearningOverview(learnerIdOf(user), offsetMinutesOf(req)), verifyFullAccess(learnerIdOf(user))]);
      return res.json({ name: user.name, email: user.email, xp: daily.profile.xp, streak: daily.streak, hasFullAccess: access.hasFullAccess });
    } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load profile" }); }
  });
  app.post("/api/mobile/lesson/complete", async (req: Request, res: Response) => {
    const user = await mobileUser(req);
    const lessonSlug = String(req.body?.lessonSlug ?? "");
    if (!user) return res.status(401).json({ error: "Authentication required" });
    // The Track is carried alongside the Lesson because the shared completion
    // path is told which Track a Lesson belongs to, and a Lesson does not know.
    const trackedLesson = CURRICULUM.flatMap(track => track.lessons.map(item => ({ track, lesson: item }))).find(item => item.lesson.id === lessonSlug);
    if (!trackedLesson) return res.status(404).json({ error: "Lesson not found" });
    const { track, lesson } = trackedLesson;
    if (lesson.order > 1 && !(await verifyFullAccess(learnerIdOf(user))).hasFullAccess) return res.status(403).json({ error: "This lesson is part of Full Access" });
    try {
      const stored = await supabaseAdminRequest<Array<{ id: string }>>(`/rest/v1/lessons?slug=eq.${encodeURIComponent(lessonSlug)}&select=id&limit=1`);
      const storedLesson = stored[0];
      if (!storedLesson) return res.status(404).json({ error: "Lesson is not available yet" });
      // Completing a Lesson is completeSupabaseLesson's job, on the phone as on
      // the web. This route used to reimplement it: a read-modify-write on
      // profiles.xp - a third XP write path, which ADR 0002 abolishes - and
      // neither an Activity Feed row nor any Earned Award reconciliation, so a
      // Learner working on the phone never earned First Spark.
      // The lookup above stays only to answer 404 for a Lesson not yet stored;
      // the shared path reports that as an error, and the Android client reads
      // the status code.
      const completion = await completeSupabaseLesson(learnerIdOf(user), offsetMinutesOf(req), { lessonId: lessonSlug, track: track.name, difficulty: lesson.difficulty, xp: lesson.xp });
      return res.json({ alreadyCompleted: !completion.isNewCompletion, awardedXp: completion.awardedXp, newAwards: completion.newAwards });
    } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to save lesson completion" }); }
  });
  app.post("/api/mobile/daily/complete", async (req: Request, res: Response) => {
    const user = await mobileUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const score = Number(req.body?.score);
    if (!Number.isInteger(score) || score < 0 || score > 100) return res.status(400).json({ error: "A score from 0 to 100 is required" });
    try { return res.json(await completeDailyLearningTask(learnerIdOf(user), offsetMinutesOf(req), { score, submittedCode: req.body?.submittedCode })); } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to complete daily practice" }); }
  });
}
