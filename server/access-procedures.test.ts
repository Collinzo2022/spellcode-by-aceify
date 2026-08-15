import { beforeEach, describe, expect, it, vi } from "vitest";

const { entitlement, supabaseRequest } = vi.hoisted(() => ({ entitlement: vi.fn(), supabaseRequest: vi.fn() }));
vi.mock("./supabaseLearning", () => ({ getVerifiedEntitlements: entitlement, completeDailyLearningTask: vi.fn(), getDailyLearningOverview: vi.fn() }));
vi.mock("./supabase", () => ({ supabaseAdminRequest: supabaseRequest }));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./db", () => ({ completeLesson: vi.fn(), recordChallengeAttempt: vi.fn(), getLearnerDashboard: vi.fn(), getLearnerProfile: vi.fn(), enrollInTrack: vi.fn() }));

import { learningRouter } from "./routers/learning";
import { projectsRouter } from "./routers/projects";
import { tutorRouter } from "./routers/tutor";
import { certificatesRouter } from "./routers/certificates";

const ctx = { user: { id: 1, openId: "learner-1", name: "Learner", email: "learner@example.com", loginMethod: "supabase", role: "user" }, req: {}, res: {} } as any;

describe("Full Access procedure enforcement", () => {
  beforeEach(() => { entitlement.mockReset(); supabaseRequest.mockReset(); entitlement.mockResolvedValue({ hasFullAccess: false, features: [] }); });

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
