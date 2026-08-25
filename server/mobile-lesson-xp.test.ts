import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseStub } from "./testing/supabaseStub";
import { makeSessionUser } from "./learner";
import { XP_ENTRIES, xpWrites } from "./testing/xpLedger";

const LEARNER_ID = "learner-1";

const { supabase } = vi.hoisted(() => ({
  supabase: { current: null as ReturnType<typeof import("./testing/supabaseStub").createSupabaseStub> | null },
}));

vi.mock("./supabase", () => ({
  supabaseAdminRequest: (path: string, init?: RequestInit) => supabase.current!.request(path, init),
  getSupabaseSessionUser: async () => makeSessionUser({ learnerId: LEARNER_ID, name: "Learner", email: "learner@example.com", role: "user" }),
}));

import { registerMobileRoutes } from "./mobile";

let stub: ReturnType<typeof createSupabaseStub>;
let app: express.Express;

beforeEach(() => {
  stub = createSupabaseStub(LEARNER_ID);
  supabase.current = stub;
  app = express();
  app.use(express.json());
  registerMobileRoutes(app);
});

/** Drive the real Express route: the route is what bypassed the shared path. */
async function post(path: string, body: unknown) {
  const server = await new Promise<ReturnType<express.Express["listen"]>>(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { authorization: "Bearer session-token", "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  await new Promise<void>(resolve => server.close(() => resolve()));
  return { status: response.status, body: payload };
}

const xpPatches = () => xpWrites(stub).patches;
const xpRecomputes = () => xpWrites(stub).recomputes;

/**
 * The Android client completes Lessons through this route. It was a third XP
 * write path - a read-modify-write on `profiles.xp` that reimplemented Lesson
 * completion badly: no XP Entry, no Activity Feed row, and no Earned Award
 * reconciliation, so a Learner on the phone never earned First Spark.
 *
 * Ticket 08 requires exactly one XP write path. The ticket names only the Daily
 * Task path; this one is the same defect and is folded in for the same reason.
 */
describe("the mobile Lesson route", () => {
  it("grants XP through the ledger, not by patching the total", async () => {
    const { status, body } = await post("/api/mobile/lesson/complete", { lessonSlug: "html-foundations" });

    expect(status).toBe(200);
    expect(body).toMatchObject({ alreadyCompleted: false, awardedXp: 50 });
    expect(stub.writesTo("xp_entries")).toHaveLength(1);
    expect(stub.writesTo("xp_entries")[0]!.body).toMatchObject({ user_id: LEARNER_ID, amount: 50, source_kind: "lesson" });
  });

  it("keeps the response contract the Android client reads", async () => {
    // The Android companion is a separate codebase that cannot be changed from
    // here, so these two keys must keep their names and meaning.
    const { body } = await post("/api/mobile/lesson/complete", { lessonSlug: "html-foundations" });

    expect(Object.keys(body as object)).toEqual(expect.arrayContaining(["alreadyCompleted", "awardedXp"]));
  });

  it("awards nothing for a Lesson the Learner has already completed", async () => {
    stub.stageRows(/^\/rest\/v1\/lesson_progress\?user_id=eq\..*&lesson_id=eq\./, [{ state: "completed" }]);

    const { body } = await post("/api/mobile/lesson/complete", { lessonSlug: "html-foundations" });

    expect(body).toMatchObject({ alreadyCompleted: true, awardedXp: 0 });
    expect(stub.writesTo("xp_entries")).toEqual([]);
    expect(xpWrites(stub).total).toBe(0);
  });

  it("awards nothing when the ledger rejects the entry as a duplicate", async () => {
    stub.stageWrites(XP_ENTRIES, []);

    const { body } = await post("/api/mobile/lesson/complete", { lessonSlug: "html-foundations" });

    expect(body).toMatchObject({ awardedXp: 0 });
    expect(xpWrites(stub).total).toBe(0);
  });

  it("still answers 404 for a Lesson that is not in storage yet", async () => {
    stub.stageRows(/^\/rest\/v1\/lessons\?slug=eq\./, []);

    const { status } = await post("/api/mobile/lesson/complete", { lessonSlug: "html-foundations" });

    expect(status).toBe(404);
  });
});
