import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseStub } from "./testing/supabaseStub";
import { makeSessionUser } from "./learner";
import { xpWrites } from "./testing/xpLedger";

const { supabase } = vi.hoisted(() => ({
  supabase: { current: null as ReturnType<typeof import("./testing/supabaseStub").createSupabaseStub> | null },
}));

vi.mock("./supabase", () => ({ supabaseAdminRequest: (path: string, init?: RequestInit) => supabase.current!.request(path, init) }));

import { learningRouter } from "./routers/learning";
import { reconcileXpTotal } from "./supabaseLearning";

const LEARNER_ID = "learner-1";
const ctx = { user: makeSessionUser({ learnerId: LEARNER_ID, name: "Learner", email: "learner@example.com", role: "user" }), req: {}, res: {} } as any;

const LEDGER_TOTAL = new RegExp(`^/rest/v1/learner_xp_totals\\?user_id=eq\\.${LEARNER_ID}`);
const PROFILE = new RegExp(`^/rest/v1/profiles\\?id=eq\\.${LEARNER_ID}`);
const STEADY_HAND = /^\/rest\/v1\/awards\?slug=eq\.steady-hand/;

let stub: ReturnType<typeof createSupabaseStub>;

/** What the ledger sums to for this Learner, whatever the cache says. */
const stageLedgerTotal = (xp: number) => stub.stageRows(LEDGER_TOTAL, [{ user_id: LEARNER_ID, xp }]);
/** What the cached column says, whatever the ledger sums to. */
const stageCachedTotal = (xp: number) => stub.stageRows(PROFILE, [{ id: LEARNER_ID, xp, current_streak: 2, longest_streak: 5, last_learning_at: "2026-08-24T12:00:00.000Z" }]);

const xpPatches = () => xpWrites(stub).patches;
const xpRecomputes = () => xpWrites(stub).recomputes;
const earnedSteadyHand = () => stub.writesTo("user_awards").filter(write => (write.body as { award_id?: string })?.award_id === "award-steady-hand");

beforeEach(() => {
  stub = createSupabaseStub(LEARNER_ID);
  supabase.current = stub;
  stub.stageRows(STEADY_HAND, [{ id: "award-steady-hand", slug: "steady-hand", name: "Steady Hand", description: "Accumulate skill through focused practice.", icon_key: "star" }]);
});

/**
 * Ticket 09: a Learner's XP total is the sum of their XP Entries. The stored
 * column becomes a cache of the ledger rather than the authority (ADR 0002).
 *
 * Every test here deliberately sets the cache and the ledger to DIFFERENT
 * numbers. That is the only way to tell which one is being read: with the two
 * in agreement - as they are in production - either implementation passes.
 */
describe("a Learner's XP total", () => {
  it("is the sum of their XP Entries, not the stored column", async () => {
    stageLedgerTotal(275);
    stageCachedTotal(999);

    const dashboard = await learningRouter.createCaller(ctx).dashboard();

    expect(dashboard.stats.xp).toBe(275);
  });

  it("is zero for a Learner with no entries, rather than falling back to the column", async () => {
    // A Learner with no entries has no row in the view at all. Reading the
    // cache when the ledger answers nothing would quietly restore the old
    // authority for exactly the Learners whose ledger is empty.
    stageCachedTotal(4200);

    const dashboard = await learningRouter.createCaller(ctx).dashboard();

    expect(dashboard.stats.xp).toBe(0);
  });
});

describe("the Steady Hand award", () => {
  it("is granted from the verified total", async () => {
    stageLedgerTotal(200);
    stageCachedTotal(0);

    await learningRouter.createCaller(ctx).dashboard();

    expect(earnedSteadyHand()).toHaveLength(1);
  });

  it("cannot be granted by a cached total the ledger does not support", async () => {
    // The award whose criterion is a number was the one award that could not be
    // defended from records. A cache inflated by a bug must not earn it.
    stageLedgerTotal(150);
    stageCachedTotal(999);

    await learningRouter.createCaller(ctx).dashboard();

    expect(earnedSteadyHand()).toHaveLength(0);
  });
});

describe("the cached total", () => {
  it("is recomputed inside the database, never patched with a number read here", async () => {
    // Incrementing is what raced: two awards landing together read the same old
    // value and one increment was lost. Reading the ledger's sum and patching it
    // back would still be a read-modify-write - the later write could carry the
    // earlier sum. Only a single UPDATE whose value is a subquery closes it, and
    // that has to live in the database.
    stageCachedTotal(10);
    stageLedgerTotal(500);

    await learningRouter.createCaller(ctx).completeLesson({ lessonId: "html-foundations", track: "HTML", difficulty: "Beginner", xp: 50 });

    expect(xpRecomputes()).toHaveLength(1);
    expect(xpRecomputes()[0]!.body).toMatchObject({ learner: LEARNER_ID });
    expect(xpPatches()).toHaveLength(0);
  });

  it("is left alone when the ledger rejected the entry as a duplicate", async () => {
    stageCachedTotal(10);
    stageLedgerTotal(500);
    stub.stageWrites(/^\/rest\/v1\/xp_entries\?on_conflict=/, []);

    const result = await learningRouter.createCaller(ctx).completeLesson({ lessonId: "html-foundations", track: "HTML", difficulty: "Beginner", xp: 50 });

    expect(result.awardedXp).toBe(0);
    expect(xpWrites(stub).total).toBe(0);
  });
});

describe("every surface a Learner sees their XP on", () => {
  it("reports the verified total on the daily overview too, not the cached column", async () => {
    // The web daily page and both mobile payloads read this one object. A
    // Learner seeing one total on their phone and another on the dashboard is
    // the cache being treated as the truth again.
    stageLedgerTotal(275);
    stageCachedTotal(999);

    const overview = await learningRouter.createCaller(ctx).dailyOverview();

    expect(overview.profile.xp).toBe(275);
  });
});

/**
 * Divergence has to be both detectable and correctable, and correctable
 * *without inventing a number*: the correction is the ledger's own sum, never
 * an adjustment or a guess.
 */
describe("reconciling a diverged total", () => {
  it("reports the divergence and corrects the cache to the ledger", async () => {
    stageCachedTotal(120);
    stageLedgerTotal(275);

    const result = await reconcileXpTotal(LEARNER_ID);

    expect(result).toEqual({ cached: 120, ledger: 275, diverged: true });
    expect(xpRecomputes()).toHaveLength(1);
    expect(xpPatches()).toHaveLength(0);
  });

  it("writes nothing when the cache already agrees with the ledger", async () => {
    stageCachedTotal(275);
    stageLedgerTotal(275);

    const result = await reconcileXpTotal(LEARNER_ID);

    expect(result).toEqual({ cached: 275, ledger: 275, diverged: false });
    expect(xpWrites(stub).total).toBe(0);
  });

  it("corrects a cache that runs ahead of the ledger, not only one behind it", async () => {
    // A cache above the ledger is the dangerous direction: it is XP the Learner
    // was shown but no record supports, and Steady Hand used to rest on it.
    stageCachedTotal(900);
    stageLedgerTotal(275);

    const result = await reconcileXpTotal(LEARNER_ID);

    expect(result).toMatchObject({ diverged: true });
    expect(xpRecomputes()).toHaveLength(1);
  });
});
