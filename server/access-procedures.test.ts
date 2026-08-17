import { beforeEach, describe, expect, it, vi } from "vitest";

const { entitlement, supabaseRequest, supabaseDashboard } = vi.hoisted(() => ({ entitlement: vi.fn(), supabaseRequest: vi.fn(), supabaseDashboard: vi.fn() }));
vi.mock("./supabaseLearning", () => ({ getVerifiedEntitlements: entitlement, completeDailyLearningTask: vi.fn(), getDailyLearningOverview: vi.fn(), getSupabaseLearnerDashboard: supabaseDashboard, enrollSupabaseTrack: vi.fn(), completeSupabaseLesson: vi.fn(), recordSupabaseChallengeAttempt: vi.fn(), recordSupabaseProjectCompletion: vi.fn() }));
vi.mock("./supabase", () => ({ supabaseAdminRequest: supabaseRequest }));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));

import { learningRouter } from "./routers/learning";
import { projectsRouter } from "./routers/projects";
import { tutorRouter } from "./routers/tutor";
import { certificatesRouter } from "./routers/certificates";

const ctx = { user: { id: 1, openId: "learner-1", name: "Learner", email: "learner@example.com", loginMethod: "supabase", role: "user" }, req: {}, res: {} } as any;

describe("Full Access procedure enforcement", () => {
  beforeEach(() => { entitlement.mockReset(); supabaseRequest.mockReset(); supabaseDashboard.mockReset(); entitlement.mockResolvedValue({ hasFullAccess: false, features: [] }); });

  it("serves the dashboard through the Supabase learning service", async () => {
    supabaseDashboard.mockResolvedValue({ stats: { xp: 0, streak: 0, completedLessons: 0 }, progress: [], activity: [], achievements: [], enrollments: [] });
    await expect(learningRouter.createCaller(ctx).dashboard()).resolves.toMatchObject({ stats: { xp: 0 } });
    expect(supabaseDashboard).toHaveBeenCalledWith("learner-1");
  });

  it("rejects advanced lesson completion without Full Access", async () => {
    await expect(learningRouter.createCaller(ctx).completeLesson({ lessonId: "css-flex-layout", track: "CSS", difficulty: "Intermediate", xp: 40 })).rejects.toThrow("Full Access");
  });

  it("rejects project publishing and tutor questions without Full Access", async () => {
    await expect(projectsRouter.createCaller(ctx).publish({ projectSlug: "landing-page", title: "Landing page", html: "<main />", css: "", javascript: "" })).rejects.toThrow("Full Access");
    await expect(tutorRouter.createCaller(ctx).ask({ messages: [{ role: "user", content: "Explain CSS" }] })).rejects.toThrow("Full Access");
  });

  it("returns a locked certificate state without Full Access", async () => {
    await expect(certificatesRouter.createCaller(ctx).status()).resolves.toMatchObject({ hasFullAccess: false, eligible: false, certificate: null });
  });
});
