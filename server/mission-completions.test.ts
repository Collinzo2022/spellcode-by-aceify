import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseStub } from "./testing/supabaseStub";
import { makeSessionUser } from "./learner";
import { BEGINNER_BUILD_MISSIONS } from "../shared/beginnerModule";

const { supabase } = vi.hoisted(() => ({
  supabase: { current: null as ReturnType<typeof import("./testing/supabaseStub").createSupabaseStub> | null },
}));

vi.mock("./supabase", () => ({ supabaseAdminRequest: (path: string, init?: RequestInit) => supabase.current!.request(path, init) }));

import { learningRouter } from "./routers/learning";

const LEARNER_ID = "learner-1";
const ctx = { user: makeSessionUser({ learnerId: LEARNER_ID, name: "Learner", email: "learner@example.com", role: "user" }), req: {}, res: {} } as any;

const LAUNCHPAD_AWARD = /^\/rest\/v1\/awards\?slug=eq\.launchpad/;

/** The Activity Feed rows the Launchpad award used to be counted out of. */
const MISSION_FEED = new RegExp(`^/rest/v1/activity_events\\?user_id=eq\\.${LEARNER_ID}&event_type=eq\\.beginner_module`);

/**
 * The Learner's Mission Completions. The staged path carries the Learner
 * filter, so a query that dropped it would miss this stub and correctly find
 * nothing.
 */
const MISSION_COMPLETIONS = new RegExp(`^/rest/v1/mission_completions\\?user_id=eq\\.${LEARNER_ID}`);

/** Code that clears the Mission at the given index of the catalog. */
const passingCode = (index: number) => BEGINNER_BUILD_MISSIONS[index]!.starterCode;

let stub: ReturnType<typeof createSupabaseStub>;

beforeEach(() => {
  stub = createSupabaseStub(LEARNER_ID);
  supabase.current = stub;
  // Award definitions live in storage; without the Launchpad row nothing can be
  // recorded against it and every assertion below would pass vacuously.
  stub.stageRows(LAUNCHPAD_AWARD, [{ id: "award-launchpad", slug: "launchpad", name: "Launchpad", description: "Turn your first guided build into a working mini webpage.", icon_key: "compass" }]);
});

const earnedLaunchpad = () => stub.writesTo("user_awards").filter(write => (write.body as { award_id?: string })?.award_id === "award-launchpad");
const missionRowFor = (slug: string) => stub.missions.find(mission => mission.slug === slug)!;
const completionsOf = (...slugs: string[]) => slugs.map(slug => ({ mission_id: missionRowFor(slug).id }));

/**
 * Ticket 05: a Mission a Learner clears becomes a Completion record, and the
 * Launchpad award is verified from those records.
 *
 * The Activity Feed is presentational (ADR 0003): unconstrained, without
 * foreign keys, and prunable at any time. An award counted out of it can be
 * revoked by a tidy-up or by renaming one string.
 */
describe("a cleared Mission", () => {
  it("is recorded against the Learner and the Mission", async () => {
    await learningRouter.createCaller(ctx).completeBeginnerMission({ missionId: "welcome", code: passingCode(0) });

    const writes = stub.writesTo("mission_completions");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.body).toMatchObject({ user_id: LEARNER_ID, mission_id: missionRowFor("welcome").id });
    expect((writes[0]!.body as { completed_at?: string }).completed_at).toEqual(expect.any(String));
  });

  it("is not recorded when the Learner's code does not clear it", async () => {
    const result = await learningRouter.createCaller(ctx).completeBeginnerMission({ missionId: "welcome", code: "<div>nothing here</div>" });

    expect(result.completed).toBe(false);
    expect(stub.writesTo("mission_completions")).toHaveLength(0);
  });

  it("counts once when the same Mission is cleared twice", async () => {
    stub.stageRows(MISSION_COMPLETIONS, completionsOf("welcome"));

    const result = await learningRouter.createCaller(ctx).completeBeginnerMission({ missionId: "welcome", code: passingCode(0) });

    expect(result).toMatchObject({ completed: true, alreadyCompleted: true, awardedXp: 0 });
    expect(stub.writesTo("mission_completions")).toHaveLength(0);
  });

  it("resolves onto the record the Learner already has rather than replacing it", async () => {
    await learningRouter.createCaller(ctx).completeBeginnerMission({ missionId: "welcome", code: passingCode(0) });

    // The date a Learner first cleared this Mission is the Completion. Ignoring
    // the conflict rather than merging keeps a second write from overwriting it,
    // whatever the application believed about earlier state.
    const write = stub.writesTo("mission_completions")[0]!;
    expect(write.path).toContain("on_conflict=user_id,mission_id");
    expect(write.prefer).toContain("ignore-duplicates");
  });

  it("opens the next Mission from the stored record, not from the Activity Feed", async () => {
    stub.stageRows(MISSION_COMPLETIONS, completionsOf("welcome"));

    const result = await learningRouter.createCaller(ctx).completeBeginnerMission({ missionId: "voice", code: passingCode(1) });

    expect(result.completed).toBe(true);
  });

  it("keeps a later Mission shut when the earlier one has no Completion record", async () => {
    stub.stageRows(MISSION_FEED, [{ id: "feed-1", metadata: { module: "beginner-build", mission_id: "welcome" } }]);

    await expect(learningRouter.createCaller(ctx).completeBeginnerMission({ missionId: "voice", code: passingCode(1) })).rejects.toThrow(/earlier/i);
  });
});

describe("the Launchpad award", () => {
  it("is earned from the stored records, with nothing in the Activity Feed", async () => {
    stub.stageRows(MISSION_COMPLETIONS, completionsOf("welcome", "voice", "action"));

    await learningRouter.createCaller(ctx).dashboard();

    expect(earnedLaunchpad()).toHaveLength(1);
  });

  it("is not earned before every Mission has a Completion record", async () => {
    stub.stageRows(MISSION_COMPLETIONS, completionsOf("welcome", "voice"));

    await learningRouter.createCaller(ctx).dashboard();

    expect(earnedLaunchpad()).toHaveLength(0);
  });

  it("counts one Mission once, however many records name it", async () => {
    stub.stageRows(MISSION_COMPLETIONS, completionsOf("welcome", "welcome", "welcome"));

    const dashboard = await learningRouter.createCaller(ctx).dashboard();

    expect(dashboard.beginnerModule.completedMissions).toBe(1);
    expect(earnedLaunchpad()).toHaveLength(0);
  });

  it("is never counted out of the Activity Feed", async () => {
    stub.stageRows(MISSION_FEED, BEGINNER_BUILD_MISSIONS.map((mission, index) => ({ id: `feed-${index}`, metadata: { module: "beginner-build", mission_id: mission.id } })));

    await learningRouter.createCaller(ctx).dashboard();

    expect(earnedLaunchpad()).toHaveLength(0);
    expect(stub.request.mock.calls.every(([path]) => !MISSION_FEED.test(String(path)))).toBe(true);
  });
});
