import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseStub } from "./testing/supabaseStub";
import { makeSessionUser } from "./learner";
import { AWARD_CATALOG } from "../shared/awards";
import { BEGINNER_BUILD_MISSIONS } from "../shared/beginnerModule";

const { supabase } = vi.hoisted(() => ({
  supabase: { current: null as ReturnType<typeof import("./testing/supabaseStub").createSupabaseStub> | null },
}));

vi.mock("./supabase", () => ({ supabaseAdminRequest: (path: string, init?: RequestInit) => supabase.current!.request(path, init) }));

import { learningRouter } from "./routers/learning";

const LEARNER_ID = "learner-1";
const ctx = { user: makeSessionUser({ learnerId: LEARNER_ID, name: "Learner", email: "learner@example.com", role: "user" }), req: {}, res: {} } as any;

const FEED = new RegExp(`^/rest/v1/activity_events\\?user_id=eq\\.${LEARNER_ID}`);

/** The three Lessons Pathfinder measures, plus the one First Spark needs. */
const PATHFINDER_LESSONS = ["html-foundations", "html-semantic-layout", "css-visual-language"];

const FULL_FEED = [
  { id: "feed-1", event_type: "lesson", title: "Lesson completed", detail: "Completed html foundations.", created_at: "2026-08-24T10:00:00.000Z" },
  { id: "feed-2", event_type: "project", title: "Project completed", detail: "Completed the landing page project.", created_at: "2026-08-24T11:00:00.000Z" },
  { id: "feed-3", event_type: "beginner_module", title: "Beginner Build Lab mission cleared", detail: "Completed Make a page say hello.", created_at: "2026-08-24T12:00:00.000Z" },
];

let stub: ReturnType<typeof createSupabaseStub>;

/**
 * A Learner who has earned everything, with every Award verifiable from their
 * Completion records alone.
 *
 * Nothing here touches the Activity Feed. That is the point: this is the whole
 * of the evidence a Learner's standing rests on after tickets 05, 06 and 08.
 */
function stageFullyVerifiedLearner() {
  stub.stageRows(new RegExp(`^/rest/v1/profiles\\?id=eq\\.${LEARNER_ID}`), [{ id: LEARNER_ID, xp: 350, current_streak: 4, longest_streak: 9, last_learning_at: "2026-08-24T12:00:00.000Z" }]);
  stub.stageRows(new RegExp(`^/rest/v1/lesson_progress\\?user_id=eq\\.${LEARNER_ID}`), PATHFINDER_LESSONS.map((slug, index) => ({ id: `progress-${index}`, lesson_id: stub.lessons.find(lesson => lesson.slug === slug)!.id, state: "completed", xp_earned: 50 })));
  stub.stageRows(new RegExp(`^/rest/v1/challenge_attempts\\?user_id=eq\\.${LEARNER_ID}`), [{ id: "attempt-1" }]);
  stub.stageRows(new RegExp(`^/rest/v1/daily_task_completions\\?user_id=eq\\.${LEARNER_ID}`), [{ id: "daily-completion-1" }]);
  stub.stageRows(new RegExp(`^/rest/v1/project_progress\\?user_id=eq\\.${LEARNER_ID}`), [{ project_id: stub.projects[0]!.id }]);
  stub.stageRows(new RegExp(`^/rest/v1/mission_completions\\?user_id=eq\\.${LEARNER_ID}`), BEGINNER_BUILD_MISSIONS.map(mission => ({ mission_id: stub.missions.find(row => row.slug === mission.id)!.id })));
  // Award definitions, so an Earned Award can be recorded against one.
  const awardRows = AWARD_CATALOG.map(award => ({ id: `award-${award.slug}`, slug: award.slug, name: award.name, description: award.description, icon_key: award.iconKey }));
  stub.stageRows(/^\/rest\/v1\/awards\?select=/, awardRows);
  for (const row of awardRows) stub.stageRows(new RegExp(`^/rest/v1/awards\\?slug=eq\\.${row.slug}&`), [row]);
  stub.stageRows(new RegExp(`^/rest/v1/user_awards\\?user_id=eq\\.${LEARNER_ID}`), awardRows.map(row => ({ award_id: row.id })));
}

/** What a Learner's standing consists of: XP, Streak, and Earned Awards. */
async function standing() {
  const dashboard = await learningRouter.createCaller(ctx).dashboard();
  return {
    xp: dashboard.stats.xp,
    streak: dashboard.stats.streak,
    earnedAwards: dashboard.earnedAwards.map(award => `${award.awardSlug}:${award.current}/${award.target}`).sort(),
    beginnerModule: dashboard.beginnerModule,
  };
}

function freshStub() {
  stub = createSupabaseStub(LEARNER_ID);
  supabase.current = stub;
}

beforeEach(freshStub);

/**
 * Ticket 07: a Learner's standing survives their Activity Feed being emptied.
 *
 * This is the safety step for ADR 0003. With Missions, Projects and XP all
 * counted from Completion records, the feed is what it was always described as:
 * a human-readable history, written for display, read only for display, and
 * prunable at any time.
 */
describe("a Learner whose Activity Feed is emptied", () => {
  /**
   * What this proves, and what it does not.
   *
   * The Earned Awards are the real demonstration: every one of their
   * `current/target` counters is recomputed from Completion records on each
   * call, so emptying the feed could genuinely change them and does not.
   *
   * The XP and Streak arms are weaker, and honestly so. Both are read straight
   * off the profile row, which has no dependency on the feed to lose - so they
   * could not fail here whatever the feed contained. What makes them true is
   * that nothing recomputes them from the feed, and that is held by the source
   * guard below rather than by this comparison. XP stops being a stored number
   * and becomes a sum of XP Entries in ticket 09; the assertion gets its teeth
   * then.
   */
  it("keeps every Earned Award, their XP total and their Streak", async () => {
    stageFullyVerifiedLearner();
    stub.stageRows(FEED, FULL_FEED);
    const withHistory = await standing();

    // The same Learner, the same Completion records, and not one feed row.
    freshStub();
    stageFullyVerifiedLearner();
    stub.stageRows(FEED, []);
    const withEmptyFeed = await standing();

    expect(withEmptyFeed).toEqual(withHistory);
    // Guard against the whole comparison passing vacuously on an empty Learner.
    expect(withEmptyFeed.earnedAwards).toHaveLength(AWARD_CATALOG.length);
    expect(withEmptyFeed.beginnerModule).toEqual({ completedMissions: BEGINNER_BUILD_MISSIONS.length, totalMissions: BEGINNER_BUILD_MISSIONS.length });
    expect(withEmptyFeed.xp).toBe(350);
    expect(withEmptyFeed.streak).toBe(4);
  });

  it("still displays the history that is there, because the feed is read for display", async () => {
    stageFullyVerifiedLearner();
    stub.stageRows(FEED, FULL_FEED);

    const dashboard = await learningRouter.createCaller(ctx).dashboard();

    expect(dashboard.activity.map(item => item.type)).toEqual(["lesson", "project", "beginner_module"]);
  });

  it("shows an empty history without losing anything else", async () => {
    stageFullyVerifiedLearner();
    stub.stageRows(FEED, []);

    const dashboard = await learningRouter.createCaller(ctx).dashboard();

    expect(dashboard.activity).toEqual([]);
    expect(dashboard.earnedAwards).toHaveLength(AWARD_CATALOG.length);
  });
});

/**
 * The property above is only worth having if it stays true. A future count,
 * gate or award reading the feed would reintroduce exactly the defect ADR 0003
 * removed, and nothing in the type system or the database would catch it - the
 * feed has no constraints and no foreign keys, which is what makes it prunable.
 *
 * So this is checked against the source itself rather than against behaviour.
 * A write addresses the table with no query string; a read always carries one,
 * which is what separates them here.
 */
describe("the codebase", () => {
  function productionSources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name);
      // _core is vendored scaffold and is regenerated, not written here.
      if (entry.isDirectory()) return entry.name === "_core" || entry.name === "node_modules" ? [] : productionSources(path);
      const isTest = entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts");
      return entry.isFile() && entry.name.endsWith(".ts") && !isTest ? [path] : [];
    });
  }

  /**
   * Source with its comments removed.
   *
   * A comment is the right place to quote the query this guard forbids - ADR
   * 0003 quotes both of the old ones - and scanning comments would make
   * documenting the defect trip the test that prevents it.
   */
  function codeOf(path: string) {
    return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  /**
   * Every mention of the feed table in production code, read or write.
   *
   * Matched on the path itself rather than on a quoted literal, so a second
   * write site cannot hide behind a different quote character or a template
   * literal. A read carries a query string; a write does not, which is the only
   * thing that separates them here.
   *
   * Deliberately literal-minded: hoisting the path into a shared constant would
   * fail these tests. That is the intended direction of failure - it fails
   * loudly and is one line to fix, rather than passing while the property is
   * false. `server/` is the only tree that talks to PostgREST; `client/` and
   * `shared/` issue no requests at all.
   */
  const feedAccesses = () =>
    productionSources(join(import.meta.dirname)).flatMap(path =>
      (codeOf(path).match(/\/rest\/v1\/activity_events(\?[^`"'\s]*)?/g) ?? []).map(access => ({ path, access })),
    );

  it("reads the Activity Feed in exactly one place, and that place is the display", () => {
    const reads = feedAccesses().filter(entry => entry.access.includes("?"));

    expect(reads).toHaveLength(1);
    // The display read: newest first, and a handful. A count would carry a
    // filter on event_type instead, which is how the old Award queries looked.
    expect(reads[0]!.access).toContain("order=created_at.desc");
    expect(reads[0]!.access).toContain("limit=");
    expect(reads[0]!.access).not.toContain("event_type=eq.");
  });

  it("writes the Activity Feed through one path", () => {
    // Two call sites wrote the feed directly before this ticket. One path means
    // a change to what the feed records is a change in one place.
    const writes = feedAccesses().filter(entry => !entry.access.includes("?"));

    expect(writes).toHaveLength(1);
  });
});
