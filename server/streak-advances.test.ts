import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubRequest } from "./testing/request";
import { createSupabaseStub } from "./testing/supabaseStub";
import { makeSessionUser } from "./learner";
import { localDayKey } from "../shared/streak";
import { BEGINNER_BUILD_MISSIONS } from "../shared/beginnerModule";

const { supabase } = vi.hoisted(() => ({
  supabase: { current: null as ReturnType<typeof import("./testing/supabaseStub").createSupabaseStub> | null },
}));

vi.mock("./supabase", () => ({ supabaseAdminRequest: (path: string, init?: RequestInit) => supabase.current!.request(path, init) }));

import { learningRouter } from "./routers/learning";

const LEARNER_ID = "learner-1";
const DAILY_TASK = { id: "daily-1", task_date: "2026-08-25", title: "Today: HTML foundations", description: "Practice", difficulty: "Beginner", xp_reward: 25, estimated_minutes: 10, task_content: {}, required_plan_code: null, lesson_id: null };

type ProfilePatch = { current_streak?: number; longest_streak?: number; last_learning_day?: string | null };

let stub: ReturnType<typeof createSupabaseStub>;

beforeEach(() => {
  stub = createSupabaseStub(LEARNER_ID);
  supabase.current = stub;
  stub.stageRows(/^\/rest\/v1\/challenges\?lesson_id=eq\./, [{ id: "challenge-1" }]);
  stub.stageRows(/^\/rest\/v1\/daily_tasks\?task_date=eq\./, [DAILY_TASK]);
});

/** The streak-bearing writes, which are the profile PATCHes naming a Local Day. */
const streakPatches = () =>
  stub
    .writesTo("profiles")
    .filter(write => write.method === "PATCH")
    .map(write => write.body as ProfilePatch)
    .filter(body => body.last_learning_day !== undefined);

/**
 * Source with its comments removed, as `fullAccess.test.ts` does.
 *
 * A comment explaining which field to render, and why the other one is wrong,
 * has to stay free to name both - otherwise documenting the rule trips the test
 * that enforces it.
 */
function codeOf(path: string) {
  return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function clientSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : clientSources(path);
    return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const callerAt = (offsetMinutes?: number) =>
  learningRouter.createCaller({ user: makeSessionUser({ learnerId: LEARNER_ID, name: "Learner", email: "learner@example.com", role: "user" }), req: stubRequest(offsetMinutes), res: {} } as any);

/**
 * Ticket 11: all five units of learning advance a Streak equally.
 *
 * `streak.test.ts` covers the arithmetic. This covers the wiring, which is the
 * half that was actually broken: before this ticket only the Daily Task path
 * touched a Streak, so a Learner who spent a week on Lessons and Missions saw a
 * Streak of 1. Asserted per kind rather than once, because "equally" is a claim
 * about five paths and a single example would not catch a sixth being added
 * without one.
 */
describe("every unit of learning", () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["a Lesson", () => callerAt().completeLesson({ lessonId: "html-foundations", track: "HTML", difficulty: "Beginner", xp: 50 })],
    ["a Challenge", () => callerAt().submitChallenge({ challengeId: "html-foundations", score: 100, passed: true, summary: "Passed" })],
    ["a Daily Task", () => callerAt().completeDailyTask({ score: 100 })],
    ["a Project", () => callerAt().completeProject({ projectId: "landing-page", title: "Landing page" })],
    ["a Mission", () => callerAt().completeBeginnerMission({ missionId: BEGINNER_BUILD_MISSIONS[0]!.id, code: BEGINNER_BUILD_MISSIONS[0]!.starterCode })],
  ];

  for (const [kind, complete] of cases) {
    it(`advances a Streak when ${kind} is completed`, async () => {
      await complete();

      expect(streakPatches()).toHaveLength(1);
      expect(streakPatches()[0]).toMatchObject({ current_streak: 1, last_learning_day: localDayKey(new Date(), 0) });
    });
  }

  it("advances a Streak once when the same Lesson is completed twice", async () => {
    // The second completion writes no XP Entry, so it must reach no Streak
    // either: replaying a request cannot manufacture a day.
    //
    // The empty write has to be staged. The stub echoes a write back as though
    // it were new, so a replay only reaches the duplicate branch - PostgREST
    // answering an ignored row with no rows - when that answer is staged, and
    // staging it up front would make the first completion a duplicate too.
    await callerAt().completeLesson({ lessonId: "html-foundations", track: "HTML", difficulty: "Beginner", xp: 50 });
    stub.stageWrites(/^\/rest\/v1\/xp_entries/, []);
    await callerAt().completeLesson({ lessonId: "html-foundations", track: "HTML", difficulty: "Beginner", xp: 50 });

    expect(streakPatches()).toHaveLength(1);
  });

  it("stamps the Local Day from the offset the request carried, not the server's", async () => {
    // UTC+14 at any instant is the furthest a Local Day can run ahead of UTC, so
    // this fails if the stamp is taken in the server's frame rather than the
    // Learner's on any day where the two differ.
    await callerAt(840).completeLesson({ lessonId: "html-foundations", track: "HTML", difficulty: "Beginner", xp: 50 });

    expect(streakPatches()[0]).toMatchObject({ last_learning_day: localDayKey(new Date(), 840) });
  });

  it("is shown from the derived Streak, never from the stored run, on every client surface", () => {
    // `current_streak` is the length of a run; whether the run is still alive is
    // the other half, and only the server knows it. A page that renders the
    // column directly shows an abandoned Streak forever - which is the bug this
    // ticket opens with, and which the Daily page had until review caught it.
    //
    // Checked against the source because it is a rendering mistake: no
    // assertion on a payload can see which field a component chose.
    const offenders = clientSources(join(import.meta.dirname, "..", "client", "src")).filter(path => /current_streak/.test(codeOf(path)));

    expect(offenders).toEqual([]);
  });

  it("records no fabricated noon-UTC instant", async () => {
    // `last_learning_at` used to be written as `${today}T12:00:00.000Z`.
    await callerAt().completeLesson({ lessonId: "html-foundations", track: "HTML", difficulty: "Beginner", xp: 50 });

    const patch = stub.writesTo("profiles").filter(write => write.method === "PATCH").map(write => write.body as { last_learning_at?: string }).find(body => body.last_learning_at);

    expect(patch?.last_learning_at).not.toMatch(/T12:00:00\.000Z$/);
  });
});
