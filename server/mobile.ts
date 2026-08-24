import { learnerIdOf } from "./learner";
import type { Express, Request, Response } from "express";
import { completeDailyLearningTask, getDailyLearningOverview, verifyFullAccess } from "./supabaseLearning";
import { getSupabaseSessionUser } from "./supabase";
import { supabaseAdminRequest } from "./supabase";
import { CURRICULUM } from "../shared/curriculum";

async function mobileUser(req: Request) {
  const authorization = req.header("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return token ? getSupabaseSessionUser(token) : null;
}

export function registerMobileRoutes(app: Express) {
  app.get("/api/mobile/curriculum", (_req: Request, res: Response) => res.json({ tracks: CURRICULUM }));
  app.get("/api/mobile/daily", async (req: Request, res: Response) => {
    const user = await mobileUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    try { return res.json(await getDailyLearningOverview(learnerIdOf(user))); } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load daily practice" }); }
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
      const [daily, access] = await Promise.all([getDailyLearningOverview(learnerIdOf(user)), verifyFullAccess(learnerIdOf(user))]);
      return res.json({ name: user.name, email: user.email, xp: daily.profile.xp, streak: daily.profile.current_streak, hasFullAccess: access.hasFullAccess });
    } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load profile" }); }
  });
  app.post("/api/mobile/lesson/complete", async (req: Request, res: Response) => {
    const user = await mobileUser(req);
    const lessonSlug = String(req.body?.lessonSlug ?? "");
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const lesson = CURRICULUM.flatMap(track => track.lessons).find(item => item.id === lessonSlug);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    if (lesson.order > 1 && !(await verifyFullAccess(learnerIdOf(user))).hasFullAccess) return res.status(403).json({ error: "This lesson is part of Full Access" });
    try {
      const stored = await supabaseAdminRequest<Array<{ id: string }>>(`/rest/v1/lessons?slug=eq.${encodeURIComponent(lessonSlug)}&select=id&limit=1`);
      const storedLesson = stored[0];
      if (!storedLesson) return res.status(404).json({ error: "Lesson is not available yet" });
      const existing = await supabaseAdminRequest<Array<{ state: string }>>(`/rest/v1/lesson_progress?user_id=eq.${encodeURIComponent(learnerIdOf(user))}&lesson_id=eq.${storedLesson.id}&select=state&limit=1`);
      const alreadyCompleted = existing[0]?.state === "completed";
      await supabaseAdminRequest("/rest/v1/lesson_progress?on_conflict=user_id,lesson_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: learnerIdOf(user), lesson_id: storedLesson.id, state: "completed", score: 100, xp_earned: lesson.xp, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      if (!alreadyCompleted) {
        const profile = await supabaseAdminRequest<Array<{ xp: number }>>(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerIdOf(user))}&select=xp&limit=1`);
        await supabaseAdminRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerIdOf(user))}`, { method: "PATCH", body: JSON.stringify({ xp: (profile[0]?.xp ?? 0) + lesson.xp, updated_at: new Date().toISOString() }) });
      }
      return res.json({ alreadyCompleted, awardedXp: alreadyCompleted ? 0 : lesson.xp });
    } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to save lesson completion" }); }
  });
  app.post("/api/mobile/daily/complete", async (req: Request, res: Response) => {
    const user = await mobileUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const score = Number(req.body?.score);
    if (!Number.isInteger(score) || score < 0 || score > 100) return res.status(400).json({ error: "A score from 0 to 100 is required" });
    try { return res.json(await completeDailyLearningTask(learnerIdOf(user), { score, submittedCode: req.body?.submittedCode })); } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to complete daily practice" }); }
  });
}
