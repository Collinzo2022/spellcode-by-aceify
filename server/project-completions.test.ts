import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubRequest } from "./testing/request";
import { createSupabaseStub } from "./testing/supabaseStub";
import { makeSessionUser } from "./learner";

const { supabase } = vi.hoisted(() => ({
  supabase: { current: null as ReturnType<typeof import("./testing/supabaseStub").createSupabaseStub> | null },
}));

vi.mock("./supabase", () => ({ supabaseAdminRequest: (path: string, init?: RequestInit) => supabase.current!.request(path, init) }));

import { learningRouter } from "./routers/learning";

const LEARNER_ID = "learner-1";
const ctx = { user: makeSessionUser({ learnerId: LEARNER_ID, name: "Learner", email: "learner@example.com", role: "user" }), req: stubRequest(), res: {} } as any;

const BUILDER_AWARD = /^\/rest\/v1\/awards\?slug=eq\.builder/;
const PROJECT_FEED = new RegExp(`^/rest/v1/activity_events\\?user_id=eq\\.${LEARNER_ID}&event_type=eq\\.project`);

/**
 * The Learner's finished Projects. The staged path carries the "finished"
 * filter deliberately, so a query that dropped it would miss this stub and
 * correctly find nothing.
 */
const FINISHED_PROJECTS = new RegExp(`^/rest/v1/project_progress\\?user_id=eq\\.${LEARNER_ID}&completed_at=not\\.is\\.null`);

/** The same table without that filter: only a query that forgot it lands here. */
const PROJECT_ROWS_UNFILTERED = new RegExp(`^/rest/v1/project_progress\\?user_id=eq\\.${LEARNER_ID}&select=`);

let stub: ReturnType<typeof createSupabaseStub>;

beforeEach(() => {
  stub = createSupabaseStub(LEARNER_ID);
  supabase.current = stub;
  // Award definitions live in storage; without the Builder row nothing can be
  // recorded against it and every assertion below would pass vacuously.
  stub.stageRows(BUILDER_AWARD, [{ id: "award-builder", slug: "builder", name: "Builder", description: "Ship your first guided coding project.", icon_key: "hammer" }]);
});

const earnedBuilder = () => stub.writesTo("user_awards").filter(write => (write.body as { award_id?: string })?.award_id === "award-builder");
const projectRowFor = (slug: string) => stub.projects.find(project => project.slug === slug)!;

/**
 * Ticket 06: the Builder award is verified from a Learner's Project records,
 * the same evidence every other award reads from.
 *
 * The Activity Feed is presentational (ADR 0003): unconstrained, without
 * foreign keys, and prunable at any time. An award counted out of it can be
 * revoked by a tidy-up or by renaming one string.
 */
describe("a completed Project", () => {
  it("is recorded against the Learner and the Project", async () => {
    await learningRouter.createCaller(ctx).completeProject({ projectId: "landing-page", title: "Build a landing page" });

    const writes = stub.writesTo("project_progress");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.body).toMatchObject({ user_id: LEARNER_ID, project_id: projectRowFor("landing-page").id });
    expect((writes[0]!.body as { completed_at?: string }).completed_at).toEqual(expect.any(String));
  });

  it("keeps the date a Learner first finished it when they finish it again", async () => {
    await learningRouter.createCaller(ctx).completeProject({ projectId: "landing-page", title: "Build a landing page" });
    await learningRouter.createCaller(ctx).completeProject({ projectId: "landing-page", title: "Build a landing page" });

    // Both writes resolve onto the same record, and resolve by ignoring rather
    // than merging - so the second completion cannot overwrite the first
    // completion's date, which is the Completion itself.
    for (const write of stub.writesTo("project_progress")) {
      expect(write.path).toContain("on_conflict=user_id,project_id");
      expect(write.prefer).toContain("ignore-duplicates");
    }
  });

  it("earns Builder from the stored record, with nothing in the Activity Feed", async () => {
    stub.stageRows(FINISHED_PROJECTS, [{ project_id: projectRowFor("landing-page").id }]);

    await learningRouter.createCaller(ctx).dashboard();

    expect(earnedBuilder()).toHaveLength(1);
  });

  it("does not earn Builder from a Project the Learner never finished", async () => {
    stub.stageRows(PROJECT_ROWS_UNFILTERED, [{ project_id: projectRowFor("landing-page").id, completed_at: null }]);

    await learningRouter.createCaller(ctx).dashboard();

    expect(earnedBuilder()).toHaveLength(0);
  });

  it("is never counted out of the Activity Feed", async () => {
    stub.stageRows(PROJECT_FEED, [{ id: "feed-1" }, { id: "feed-2" }]);

    await learningRouter.createCaller(ctx).dashboard();

    expect(earnedBuilder()).toHaveLength(0);
    expect(stub.request.mock.calls.every(([path]) => !PROJECT_FEED.test(String(path)))).toBe(true);
  });
});
