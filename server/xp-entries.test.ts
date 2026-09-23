import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubRequest } from "./testing/request";
import { createSupabaseStub } from "./testing/supabaseStub";
import { makeSessionUser } from "./learner";
import { BEGINNER_BUILD_MISSIONS } from "../shared/beginnerModule";
import { XP_ENTRIES, xpWrites } from "./testing/xpLedger";

const { supabase } = vi.hoisted(() => ({
  supabase: { current: null as ReturnType<typeof import("./testing/supabaseStub").createSupabaseStub> | null },
}));

vi.mock("./supabase", () => ({ supabaseAdminRequest: (path: string, init?: RequestInit) => supabase.current!.request(path, init) }));

import { learningRouter } from "./routers/learning";

const LEARNER_ID = "learner-1";
const ctx = { user: makeSessionUser({ learnerId: LEARNER_ID, name: "Learner", email: "learner@example.com", role: "user" }), req: stubRequest(), res: {} } as any;

const CHALLENGE_ROW = { id: "challenge-1" };
const DAILY_TASK = { id: "daily-1", task_date: "2026-08-25", title: "Today: HTML foundations", description: "Practice", difficulty: "Beginner", xp_reward: 25, estimated_minutes: 10, task_content: {}, required_plan_code: null, lesson_id: null };

type XpEntryBody = { user_id?: string; amount?: number; source_kind?: string; source_id?: string };

let stub: ReturnType<typeof createSupabaseStub>;

beforeEach(() => {
  stub = createSupabaseStub(LEARNER_ID);
  supabase.current = stub;
  stub.stageRows(/^\/rest\/v1\/challenges\?lesson_id=eq\./, [CHALLENGE_ROW]);
  stub.stageRows(/^\/rest\/v1\/daily_tasks\?task_date=eq\./, [DAILY_TASK]);
});

const xpEntries = () => stub.writesTo("xp_entries").map(write => write.body as XpEntryBody);
const profilePatches = () => stub.writesTo("profiles").filter(write => write.method === "PATCH");
const xpPatches = () => xpWrites(stub).patches;
const xpRecomputes = () => xpWrites(stub).recomputes;
const lessonRowFor = (slug: string) => stub.lessons.find(lesson => lesson.slug === slug)!;
const missionRowFor = (slug: string) => stub.missions.find(mission => mission.slug === slug)!;
const projectRowFor = (slug: string) => stub.projects.find(project => project.slug === slug)!;

const completeLesson = () => learningRouter.createCaller(ctx).completeLesson({ lessonId: "html-foundations", track: "HTML", difficulty: "Beginner", xp: 50 });

/**
 * Ticket 08: every XP award is a row in a ledger naming the Completion that
 * caused it, and there is exactly one path that writes one.
 *
 * XP was a counter incremented in place by a read-modify-write, so two
 * completions landing together lost one award and nothing recorded why a total
 * was what it was - inside a catalog whose premise is verified evidence
 * (ADR 0002).
 */
describe("an XP award", () => {
  it("is recorded as an entry naming the Learner, the amount and the source", async () => {
    await completeLesson();

    expect(xpEntries()).toEqual([{ user_id: LEARNER_ID, amount: 50, source_kind: "lesson", source_id: lessonRowFor("html-foundations").id }]);
  });

  it("is rejected by the database rather than guarded in application code", async () => {
    await completeLesson();

    // The unique constraint on (user_id, source_kind, source_id) is what makes a
    // double award impossible. Resolving by ignoring rather than merging is what
    // keeps the ledger append-only: a conflicting write changes no existing row.
    const write = stub.writesTo("xp_entries")[0]!;
    expect(write.path).toContain("on_conflict=user_id,source_kind,source_id");
    expect(write.prefer).toContain("ignore-duplicates");
    expect(write.prefer).toContain("return=representation");
  });

  it("never updates or deletes an entry", async () => {
    await completeLesson();
    await learningRouter.createCaller(ctx).completeProject({ projectId: "landing-page", title: "Build a landing page" });

    expect(stub.writesTo("xp_entries").every(write => write.method === "POST")).toBe(true);
  });

  it("moves the cached total only when an entry was actually written", async () => {
    // Since ticket 09 the cache is recomputed inside the database rather than
    // patched with a number this process worked out, so what to look for is the
    // recompute, and no patch of the column at all.
    await completeLesson();

    expect(xpRecomputes()).toHaveLength(1);
    expect(xpRecomputes()[0]!.body).toMatchObject({ learner: LEARNER_ID });
    expect(xpPatches()).toHaveLength(0);
  });

  it("leaves the cached total alone when the database rejects the entry as a duplicate", async () => {
    // What PostgREST returns when `ignore-duplicates` discarded the row: the
    // Learner has already been paid for this Completion.
    stub.stageWrites(XP_ENTRIES, []);

    const result = await completeLesson();

    expect(result.awardedXp).toBe(0);
    expect(xpWrites(stub).total).toBe(0);
  });
});

describe("every unit of learning", () => {
  it("writes an entry when a Lesson is completed", async () => {
    await completeLesson();

    expect(xpEntries()).toMatchObject([{ source_kind: "lesson", amount: 50 }]);
  });

  it("writes an entry when a Challenge is passed, naming the Challenge", async () => {
    await learningRouter.createCaller(ctx).submitChallenge({ challengeId: "html-foundations", score: 100, passed: true, summary: "Passed" });

    expect(xpEntries()).toEqual([{ user_id: LEARNER_ID, amount: 20, source_kind: "challenge", source_id: CHALLENGE_ROW.id }]);
  });

  it("writes no second entry when the same Challenge is passed again", async () => {
    // A Challenge attempt is a new row every time, so the attempt cannot be what
    // the entry names: XP would be farmable by resubmitting, and Steady Hand
    // ("Earn 200 XP") rests on this total. The Challenge is what is paid for.
    stub.stageWrites(XP_ENTRIES, []);

    const result = await learningRouter.createCaller(ctx).submitChallenge({ challengeId: "html-foundations", score: 100, passed: true, summary: "Passed again" });

    expect(result.awardedXp).toBe(0);
    expect(xpWrites(stub).total).toBe(0);
  });

  it("writes no entry when a Challenge is failed", async () => {
    await learningRouter.createCaller(ctx).submitChallenge({ challengeId: "html-foundations", score: 10, passed: false, summary: "Not yet" });

    expect(xpEntries()).toEqual([]);
  });

  it("writes an entry when a Project is completed, naming the Project", async () => {
    await learningRouter.createCaller(ctx).completeProject({ projectId: "landing-page", title: "Build a landing page" });

    expect(xpEntries()).toEqual([{ user_id: LEARNER_ID, amount: 100, source_kind: "project", source_id: projectRowFor("landing-page").id }]);
  });

  it("writes an entry when a Mission is cleared, naming the Mission", async () => {
    const mission = BEGINNER_BUILD_MISSIONS[0]!;

    await learningRouter.createCaller(ctx).completeBeginnerMission({ missionId: mission.id, code: mission.starterCode });

    expect(xpEntries()).toEqual([{ user_id: LEARNER_ID, amount: mission.rewardXp, source_kind: "mission", source_id: missionRowFor(mission.id).id }]);
  });

  it("writes an entry when a Daily Task is completed, naming the Daily Task", async () => {
    await learningRouter.createCaller(ctx).completeDailyTask({ score: 100 });

    expect(xpEntries()).toEqual([{ user_id: LEARNER_ID, amount: DAILY_TASK.xp_reward, source_kind: "daily_task", source_id: DAILY_TASK.id }]);
  });
});

/**
 * The Daily Task path patched `profiles.xp` inline, bypassing the shared path
 * entirely - a second write path with the same race, and the one the ticket
 * names. Its streak and last-learning-at write stays: those are not XP.
 */
describe("the Daily Task path", () => {
  it("no longer patches the total inline", async () => {
    await learningRouter.createCaller(ctx).completeDailyTask({ score: 100 });

    // No write patches the `xp` column at all. The only thing that moves the
    // cached total is the recompute, the same one every other unit goes through.
    expect(xpPatches()).toHaveLength(0);
    expect(xpRecomputes()).toHaveLength(1);
  });

  it("still records the Learner's streak", async () => {
    await learningRouter.createCaller(ctx).completeDailyTask({ score: 100 });

    const streakPatch = profilePatches().find(write => Object.prototype.hasOwnProperty.call(write.body ?? {}, "current_streak"));
    expect(streakPatch!.body).toMatchObject({ current_streak: 1 });
  });

  it("awards nothing when the Daily Task is already complete", async () => {
    stub.stageRows(/^\/rest\/v1\/daily_task_completions\?user_id=eq\./, [{ state: "completed", xp_earned: 25, completed_at: "2026-08-25T09:00:00.000Z" }]);

    const result = await learningRouter.createCaller(ctx).completeDailyTask({ score: 100 });

    expect(result).toMatchObject({ alreadyCompleted: true, awardedXp: 0 });
    expect(xpEntries()).toEqual([]);
  });
});
