import type { Express, Request, Response } from "express";
import { completeDailyLearningTask, getDailyLearningOverview, getVerifiedEntitlements } from "./supabaseLearning";
import { getSupabaseSessionUser } from "./supabase";

async function mobileUser(req: Request) {
  const authorization = req.header("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return token ? getSupabaseSessionUser(token) : null;
}

export function registerMobileRoutes(app: Express) {
  app.get("/api/mobile/daily", async (req: Request, res: Response) => {
    const user = await mobileUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    try { return res.json(await getDailyLearningOverview(user.openId)); } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load daily practice" }); }
  });
  app.get("/api/mobile/access", async (req: Request, res: Response) => {
    const user = await mobileUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    try { return res.json(await getVerifiedEntitlements(user.openId)); } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to load access" }); }
  });
  app.post("/api/mobile/daily/complete", async (req: Request, res: Response) => {
    const user = await mobileUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const score = Number(req.body?.score);
    if (!Number.isInteger(score) || score < 0 || score > 100) return res.status(400).json({ error: "A score from 0 to 100 is required" });
    try { return res.json(await completeDailyLearningTask(user.openId, { score, submittedCode: req.body?.submittedCode })); } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to complete daily practice" }); }
  });
}
