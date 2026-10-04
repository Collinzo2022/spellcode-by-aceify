import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubRequest } from "./testing/request";
import { createSupabaseStub } from "./testing/supabaseStub";
import { forgeOff, forgeOn, restoreForge } from "./testing/forge";
import { makeSessionUser } from "./learner";
import { expectNoFeatureArray } from "./testing/assertions";

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
import { billingRouter } from "./routers/billing";

const LEARNER_ID = "learner-1";
const ctx = { user: makeSessionUser({ learnerId: LEARNER_ID, name: "Learner", email: "learner@example.com", role: "user" }), req: stubRequest(), res: {} } as any;

const COMPLETED_LESSONS = new RegExp(`^/rest/v1/lesson_progress\\?user_id=eq\\.${LEARNER_ID}&state=eq\\.completed`);

let stub: ReturnType<typeof createSupabaseStub>;

// The tutor, Project publishing and certificates refuse to run without Forge
// (ticket 15). Every test here except the "without Forge" block configures it,
// so the Full Access gate is the only thing they measure; storagePut and
// invokeLLM are mocked, so nothing reaches Forge regardless.
beforeEach(() => {
  stub = createSupabaseStub(LEARNER_ID);
  supabase.current = stub;
  storagePut.mockReset();
  invokeLLM.mockReset();
  forgeOn();
});

afterEach(restoreForge);

describe("the learner dashboard", () => {
  it("reports the signed-in learner's own stored progress", async () => {
    // Today, so the run is still live: since ticket 11 a Streak is derived on
    // read and a fixed past date would report 0 (see streak.test.ts).
    stub.stageRows(new RegExp(`^/rest/v1/profiles\\?id=eq\\.${LEARNER_ID}`), [{ id: LEARNER_ID, xp: 120, current_streak: 4, longest_streak: 9, last_learning_at: new Date().toISOString(), last_learning_day: new Date().toISOString().slice(0, 10) }]);
    // XP is the sum of the Learner's XP Entries since ticket 09; the column on
    // the profile is a cache of it and is not what the dashboard reports.
    stub.stageRows(new RegExp(`^/rest/v1/learner_xp_totals\\?user_id=eq\\.${LEARNER_ID}`), [{ user_id: LEARNER_ID, xp: 120 }]);
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

  it("separates earned awards from next goals by joining the stored row id to an award slug", async () => {
    stub.stageRows(new RegExp(`^/rest/v1/user_awards\\?user_id=eq\\.${LEARNER_ID}`), [{ award_id: "row-uuid-1" }]);
    stub.stageRows(/^\/rest\/v1\/awards\?select=/, [{ id: "row-uuid-1", slug: "first-spark", name: "First Spark", description: "Your first verified lesson completion.", icon_key: "spark" }]);

    const dashboard = await learningRouter.createCaller(ctx).dashboard();

    expect(dashboard.earnedAwards.map(award => award.awardSlug)).toEqual(["first-spark"]);
    expect(dashboard.earnedAwards[0]).toMatchObject({ name: "First Spark", earned: true });
    expect(dashboard.nextAwards.every(award => award.awardSlug !== "first-spark")).toBe(true);
  });
});

describe("Full Access enforcement for a Learner without it", () => {
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

describe("Full Access enforcement for a Learner who holds it", () => {
  beforeEach(() => stub.grantFullAccess());

  it("allows advanced lesson completion and records it", async () => {
    const result = await learningRouter.createCaller(ctx).completeLesson({ lessonId: "css-flex-layout", track: "CSS", difficulty: "Intermediate", xp: 40 });

    expect(result).toMatchObject({ completed: true, isNewCompletion: true, awardedXp: 75 });
    expect(stub.writesTo("lesson_progress")).toHaveLength(1);
    expect(stub.writesTo("lesson_progress")[0]!.body).toMatchObject({ user_id: LEARNER_ID, state: "completed", xp_earned: 75 });
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

/**
 * Ticket 15: without Forge the three features it backs say they are
 * unavailable, as a SERVICE_UNAVAILABLE error (503) rather than the 500 a
 * missing Forge configuration used to surface as.
 *
 * Unavailable is checked before Full Access, so no Learner is told to buy
 * access to a feature that cannot run - the no-Full-Access arms below are what
 * hold that ordering.
 */
describe("without Forge", () => {
  beforeEach(forgeOff);

  const unavailable = { code: "SERVICE_UNAVAILABLE", message: expect.stringMatching(/temporarily unavailable/) };

  describe.each([
    ["a Learner without Full Access", () => undefined],
    ["a Learner who holds Full Access", () => stub.grantFullAccess()],
  ])("for %s", (_label, arrange) => {
    beforeEach(() => arrange());

    it("refuses project publishing as unavailable and stores nothing", async () => {
      await expect(projectsRouter.createCaller(ctx).publish({ projectSlug: "landing-page", title: "Landing page", html: "<main />", css: "", javascript: "" })).rejects.toMatchObject(unavailable);
      expect(storagePut).not.toHaveBeenCalled();
      expect(stub.writesTo("published_projects")).toHaveLength(0);
    });

    it("refuses tutor questions as unavailable and never calls the model", async () => {
      await expect(tutorRouter.createCaller(ctx).ask({ messages: [{ role: "user", content: "Explain CSS" }] })).rejects.toMatchObject(unavailable);
      expect(invokeLLM).not.toHaveBeenCalled();
    });

    it("refuses certificate issuance as unavailable and records nothing", async () => {
      stub.stageRows(COMPLETED_LESSONS, stub.lessons.map(lesson => ({ lesson_id: lesson.id })));

      await expect(certificatesRouter.createCaller(ctx).issue()).rejects.toMatchObject(unavailable);
      expect(storagePut).not.toHaveBeenCalled();
      expect(stub.writesTo("certificates")).toHaveLength(0);
    });
  });

  it("still reports certificate progress, which never needed Forge", async () => {
    stub.grantFullAccess();
    stub.stageRows(COMPLETED_LESSONS, [{ lesson_id: stub.lessons[0]!.id }]);

    await expect(certificatesRouter.createCaller(ctx).status()).resolves.toMatchObject({ hasFullAccess: true, completedLessons: 1 });
  });
});

/**
 * ADR 0001: Full Access is a single gate, not a set of entitlements.
 *
 * These tests guard the two halves of that decision. The gates must agree with
 * each other whichever Plan a Learner holds, and no response may carry a
 * features array - an unenforced permission set on the wire is the exact thing
 * a future contributor could mistake for a real check.
 */
describe("Full Access as a single gate", () => {
  const PLAN_IDS = ["full-access-one-time", "full-access-3-month", "full-access-6-month"];
  const ALL_OPEN = { advancedLesson: true, projectPublishing: true, aiTutor: true, certificates: true };

  /**
   * Drive all four gates and report which opened.
   *
   * A gate counts as closed only when it refuses for lack of Full Access. Any
   * other rejection - a missing stub, a renamed table - is rethrown, so a
   * broken test cannot masquerade as an enforced gate.
   */
  async function gateOutcomes() {
    storagePut.mockResolvedValue({ key: `certificates/${LEARNER_ID}/SC-TEST.html`, url: "https://example.test/artifact" });
    invokeLLM.mockResolvedValue({ choices: [{ message: { content: "CSS lays out the page." } }] });
    // Issuance is the certificate gate; eligibility is a separate rule, so stage
    // a complete path and leave Full Access as the only thing being measured.
    stub.stageRows(COMPLETED_LESSONS, stub.lessons.map(lesson => ({ lesson_id: lesson.id })));
    const opens = (result: Promise<unknown>) => result.then(() => true, (error: unknown) => { if (error instanceof Error && error.message.includes("Full Access")) return false; throw error; });
    return {
      advancedLesson: await opens(learningRouter.createCaller(ctx).completeLesson({ lessonId: "css-flex-layout", track: "CSS", difficulty: "Intermediate", xp: 40 })),
      projectPublishing: await opens(projectsRouter.createCaller(ctx).publish({ projectSlug: "landing-page", title: "Landing page", html: "<main />", css: "", javascript: "" })),
      aiTutor: await opens(tutorRouter.createCaller(ctx).ask({ messages: [{ role: "user", content: "Explain CSS" }] })),
      certificates: await opens(certificatesRouter.createCaller(ctx).issue()),
    };
  }

  it("opens every gate for a learner on any plan, and the same gates on each", async () => {
    const outcomes: Array<Awaited<ReturnType<typeof gateOutcomes>>> = [];

    for (const planId of PLAN_IDS) {
      stub = createSupabaseStub(LEARNER_ID);
      supabase.current = stub;
      stub.grantFullAccess(planId);
      outcomes.push(await gateOutcomes());
    }

    expect(outcomes).toEqual([ALL_OPEN, ALL_OPEN, ALL_OPEN]);
  });

  it("closes every gate for a learner on no plan", async () => {
    expect(await gateOutcomes()).toEqual({ advancedLesson: false, projectPublishing: false, aiTutor: false, certificates: false });
  });

  it("answers the access query with the gate alone", async () => {
    await expect(billingRouter.createCaller(ctx).myAccess()).resolves.toEqual({ hasFullAccess: false });

    stub.grantFullAccess();

    await expect(billingRouter.createCaller(ctx).myAccess()).resolves.toEqual({ hasFullAccess: true });
  });

  it("carries no features array in the daily overview", async () => {
    stub.grantFullAccess();

    const overview = await learningRouter.createCaller(ctx).dailyOverview();

    expectNoFeatureArray(overview);
    expect(overview.hasPaidAccess).toBe(true);
  });

  it("offers no plan a feature list to be gated on", async () => {
    stub.stageRows(/^\/rest\/v1\/plans\?select=/, [{ id: "plan-1", code: "full-access-one-time", name: "Full Access", currency: "NGN", amount_minor: 12000000, interval: "one_time", max_installments: 1, paystack_plan_code: null, is_active: true }]);

    const [plan] = await billingRouter.createCaller(ctx).accessOptions();

    expect(plan).not.toHaveProperty("paid_features");
    expect(stub.request.mock.calls.every(([path]) => !String(path).includes("paid_features"))).toBe(true);
  });
});
