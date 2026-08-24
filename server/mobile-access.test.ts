import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseStub } from "./testing/supabaseStub";
import { makeSessionUser } from "./learner";
import { expectNoFeatureArray } from "./testing/assertions";

const LEARNER_ID = "learner-1";

const { supabase } = vi.hoisted(() => ({
  supabase: {
    current: null as ReturnType<
      typeof import("./testing/supabaseStub").createSupabaseStub
    > | null,
  },
}));

vi.mock("./supabase", () => ({
  supabaseAdminRequest: (path: string, init?: RequestInit) =>
    supabase.current!.request(path, init),
  getSupabaseSessionUser: async () =>
    makeSessionUser({
      learnerId: LEARNER_ID,
      name: "Learner",
      email: "learner@example.com",
      role: "user",
    }),
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

/** Drive the real Express route, since the payload shape is the thing under test. */
async function get(path: string) {
  const server = await new Promise<ReturnType<express.Express["listen"]>>(
    resolve => {
      const instance = app.listen(0, () => resolve(instance));
    }
  );
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { authorization: "Bearer session-token" },
  });
  const body = await response.json();
  await new Promise<void>(resolve => server.close(() => resolve()));
  return { status: response.status, body };
}

/**
 * The Android client reads these payloads. ADR 0001 removed the features array
 * from them: it was never enforced, and shipping an unenforced permission set
 * to a client invites someone to gate on it.
 */
describe("the mobile access payloads", () => {
  it("answers the access route with the gate alone", async () => {
    const { status, body } = await get("/api/mobile/access");

    expect(status).toBe(200);
    expect(body).toEqual({ hasFullAccess: false });
  });

  it("reports Full Access from a verified plan, still with the gate alone", async () => {
    stub.grantFullAccess();

    const { body } = await get("/api/mobile/access");

    expect(body).toEqual({ hasFullAccess: true });
  });

  it("carries no features array in the profile payload", async () => {
    stub.grantFullAccess();

    const { body } = await get("/api/mobile/profile");

    expectNoFeatureArray(body);
    expect(body).toMatchObject({
      name: "Learner",
      email: "learner@example.com",
      hasFullAccess: true,
    });
  });

  it("carries no features array in the daily payload", async () => {
    const { body } = await get("/api/mobile/daily");

    expectNoFeatureArray(body);
  });
});
