import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseStub } from "./testing/supabaseStub";

const { supabase, storagePut, invokeLLM } = vi.hoisted(() => ({
  supabase: { current: null as ReturnType<typeof import("./testing/supabaseStub").createSupabaseStub> | null },
  storagePut: vi.fn(),
  invokeLLM: vi.fn(),
}));

vi.mock("./supabase", () => ({ supabaseAdminRequest: (path: string, init?: RequestInit) => supabase.current!.request(path, init) }));
vi.mock("./storage", () => ({ storagePut }));
vi.mock("./_core/llm", () => ({ invokeLLM }));

import { learningRouter } from "./routers/learning";
import { projectsRouter } from "./routers/projects";
import { tutorRouter } from "./routers/tutor";
import { certificatesRouter } from "./routers/certificates";

const LEARNER_ID = "learner-1";
const ctx = { user: { id: 1, openId: LEARNER_ID, name: "Learner", email: "learner@example.com", loginMethod: "supabase", role: "user" }, req: {}, res: {} } as any;

const COMPLETED_LESSONS = new RegExp(`^/rest/v1/lesson_progress\\?user_id=eq\\.${LEARNER_ID}&state=eq\\.completed`);

let stub: ReturnType<typeof createSupabaseStub>;

beforeEach(() => {
  stub = createSupabaseStub(LEARNER_ID);
  supabase.current = stub;
  storagePut.mockReset();
  invokeLLM.mockReset();
});

describe("the learner dashboard", () => {
  it("reports the signed-in learner's own stored progress", async () => {
    stub.stageRows(new RegExp(`^/rest/v1/profiles\\?id=eq\\.${LEARNER_ID}`), [{ id: LEARNER_ID, xp: 120, current_streak: 4, longest_streak: 9, last_learning_at: "2026-08-23" }]);
    stub.stageRows(new RegExp(`^/rest/v1/lesson_progress\\?user_id=eq\\.${LEARNER_ID}&select=`), [
      { id: "progress-1", lesson_id: stub.lessons[0]!.id, state: "completed", xp_earned: 30 },
      { id: "progress-2", lesson_id: stub.lessons[1]!.id, state: "in_progress", xp_earned: 0 },
    ]);

    const dashboard = await learningRouter.createCaller(ctx).dashboard();

    expect(dashboard.stats).toMatchObject({ xp: 120, streak: 4, completedLessons: 1 });
    expect(dashboard.progress).toHaveLength(2);
    expect(dashboard.progress[0]).toMatchObject({ lessonId: stub.lessons[0]!.slug, status: "completed" });
  });

  it("reports an empty record for a learner who has done nothing yet", async () => {
    const dashboard = await learningRouter.createCaller(ctx).dashboard();

    expect(dashboard.stats).toMatchObject({ xp: 0, streak: 0, completedLessons: 0 });
    expect(dashboard.progress).toEqual([]);
  });
});

describe("Full Access enforcement without an entitlement", () => {
  it("rejects advanced lesson completion", async () => {
    await expect(learningRouter.createCaller(ctx).completeLesson({ lessonId: "css-flex-layout", track: "CSS", difficulty: "Intermediate", xp: 40 })).rejects.toThrow("Full Access");
    expect(stub.writesTo("lesson_progress")).toHaveLength(0);
  });

  it("rejects project publishing", async () => {
    await expect(projectsRouter.createCaller(ctx).publish({ projectSlug: "landing-page", title: "Landing page", html: "<main />", css: "", javascript: "" })).rejects.toThrow("Full Access");
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("rejects tutor questions", async () => {
    await expect(tutorRouter.createCaller(ctx).ask({ messages: [{ role: "user", content: "Explain CSS" }] })).rejects.toThrow("Full Access");
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("returns a locked certificate state", async () => {
    await expect(certificatesRouter.createCaller(ctx).status()).resolves.toMatchObject({ hasFullAccess: false, eligible: false, certificate: null });
  });

  it("rejects certificate issuance", async () => {
    await expect(certificatesRouter.createCaller(ctx).issue()).rejects.toThrow("Full Access");
    expect(stub.writesTo("certificates")).toHaveLength(0);
  });
});

describe("Full Access enforcement with a verified entitlement", () => {
  beforeEach(() => stub.grantFullAccess());

  it("allows advanced lesson completion and records it", async () => {
    const result = await learningRouter.createCaller(ctx).completeLesson({ lessonId: "css-flex-layout", track: "CSS", difficulty: "Intermediate", xp: 40 });

    expect(result).toMatchObject({ completed: true, isNewCompletion: true, awardedXp: 40 });
    expect(stub.writesTo("lesson_progress")).toHaveLength(1);
    expect(stub.writesTo("lesson_progress")[0]!.body).toMatchObject({ user_id: LEARNER_ID, state: "completed", xp_earned: 40 });
  });

  it("allows project publishing", async () => {
    storagePut.mockResolvedValue({ key: `published-projects/${LEARNER_ID}/landing-page/index.html`, url: "https://example.test/landing-page" });

    await expect(projectsRouter.createCaller(ctx).publish({ projectSlug: "landing-page", title: "Landing page", html: "<main />", css: "", javascript: "" })).resolves.toEqual({ url: "https://example.test/landing-page" });
    expect(stub.writesTo("published_projects")).toHaveLength(1);
  });

  it("allows tutor questions", async () => {
    invokeLLM.mockResolvedValue({ choices: [{ message: { content: "CSS lays out the page." } }] });

    await expect(tutorRouter.createCaller(ctx).ask({ messages: [{ role: "user", content: "Explain CSS" }] })).resolves.toEqual({ content: "CSS lays out the page." });
  });

  it("reports certificate progress rather than a locked state", async () => {
    stub.stageRows(COMPLETED_LESSONS, [{ lesson_id: stub.lessons[0]!.id }]);

    const status = await certificatesRouter.createCaller(ctx).status();

    expect(status).toMatchObject({ hasFullAccess: true, completedLessons: 1, eligible: false });
    expect(status.totalLessons).toBe(stub.lessons.length);
  });

  it("refuses to issue a certificate until every lesson is complete", async () => {
    stub.stageRows(COMPLETED_LESSONS, [{ lesson_id: stub.lessons[0]!.id }]);

    await expect(certificatesRouter.createCaller(ctx).issue()).rejects.toThrow(/Complete all/);
    expect(stub.writesTo("certificates")).toHaveLength(0);
  });

  it("issues a certificate once every lesson is complete", async () => {
    stub.stageRows(COMPLETED_LESSONS, stub.lessons.map(lesson => ({ lesson_id: lesson.id })));
    storagePut.mockResolvedValue({ key: `certificates/${LEARNER_ID}/SC-TEST.html`, url: "https://example.test/certificate" });

    await expect(certificatesRouter.createCaller(ctx).issue()).resolves.toMatchObject({ url: "https://example.test/certificate", alreadyIssued: false });
    expect(stub.writesTo("certificates")).toHaveLength(1);
    expect(stub.writesTo("certificates")[0]!.body).toMatchObject({ user_id: LEARNER_ID });
  });

  it("returns the existing certificate instead of issuing a second one", async () => {
    stub.stageRows(COMPLETED_LESSONS, stub.lessons.map(lesson => ({ lesson_id: lesson.id })));
    stub.stageRows(new RegExp(`^/rest/v1/certificates\\?user_id=eq\\.${LEARNER_ID}`), [{ download_url: "https://example.test/original", issued_at: "2026-08-01" }]);

    await expect(certificatesRouter.createCaller(ctx).issue()).resolves.toEqual({ url: "https://example.test/original", alreadyIssued: true });
    expect(stub.writesTo("certificates")).toHaveLength(0);
  });
});
