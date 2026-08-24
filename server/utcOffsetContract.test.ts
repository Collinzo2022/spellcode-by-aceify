import type express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseStub } from "./testing/supabaseStub";
import { makeSessionUser } from "./learner";
import { UTC_OFFSET_HEADER } from "../shared/utcOffset";

const LEARNER_ID = "learner-1";

const { supabase } = vi.hoisted(() => ({
  supabase: { current: null as ReturnType<typeof import("./testing/supabaseStub").createSupabaseStub> | null },
}));

vi.mock("./supabase", () => ({
  supabaseAdminRequest: (path: string, init?: RequestInit) => supabase.current!.request(path, init),
  getSupabaseSessionUser: async () => makeSessionUser({ learnerId: LEARNER_ID, name: "Learner", email: "learner@example.com", role: "user" }),
}));

import { createSpellCodeApp } from "./app";

let app: express.Express;

beforeEach(() => {
  supabase.current = createSupabaseStub(LEARNER_ID);
  app = createSpellCodeApp();
});

/** Drive the real application, since accepting the header is what is under test. */
async function request(path: string, headers: Record<string, string> = {}, init: RequestInit = {}) {
  const server = await new Promise<ReturnType<express.Express["listen"]>>(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers: { authorization: "Bearer session-token", ...headers } });
  const body = await response.json().catch(() => null);
  await new Promise<void>(resolve => server.close(() => resolve()));
  return { status: response.status, body };
}

const get = (path: string, headers: Record<string, string> = {}) => request(path, headers);

/**
 * Ticket 10 is the expand step: the contract widens and the server accepts the
 * value, but nothing derives a Streak from it yet. So these tests are about
 * what the server tolerates, not about what it computes.
 */
describe("the UTC offset a client sends", () => {
  it("accepts a request that carries an offset", async () => {
    const { status } = await get("/api/mobile/curriculum", { [UTC_OFFSET_HEADER]: "-300" });

    expect(status).toBe(200);
  });

  it("accepts a request that carries none, treating the learner as being on UTC", async () => {
    const { status } = await get("/api/mobile/curriculum");

    expect(status).toBe(200);
  });

  it("refuses an offset that could only come from a broken client", async () => {
    const { status, body } = await get("/api/mobile/curriculum", { [UTC_OFFSET_HEADER]: "banana" });

    expect(status).toBe(400);
    expect(body.error).toMatch(/UTC offset/i);
  });

  it("refuses an offset beyond any real one", async () => {
    expect((await get("/api/mobile/curriculum", { [UTC_OFFSET_HEADER]: "900" })).status).toBe(400);
    expect((await get("/api/mobile/curriculum", { [UTC_OFFSET_HEADER]: "-900" })).status).toBe(400);
  });

  it("leaves the Paystack webhook out of a contract it is not party to", async () => {
    const { status, body } = await request("/api/paystack/webhook", { [UTC_OFFSET_HEADER]: "banana", "content-type": "application/json" }, { method: "POST", body: "{}" });

    // Refused for its signature, which is Paystack's contract - never for an
    // offset header a payment provider has no reason to send correctly.
    expect(status).toBe(401);
    expect(JSON.stringify(body)).not.toMatch(/UTC offset/i);
  });

  it("holds the tRPC surface to the same contract as the mobile routes", async () => {
    const { status } = await get("/api/trpc/learning.catalog", { [UTC_OFFSET_HEADER]: "banana" });

    expect(status).toBe(400);
  });

  it("changes no streak a learner is shown, whatever offset they send", async () => {
    const withoutOffset = await get("/api/mobile/daily");
    const withOffset = await get("/api/mobile/daily", { [UTC_OFFSET_HEADER]: "780" });

    expect(withOffset.status).toBe(200);
    expect(withOffset.body.profile).toEqual(withoutOffset.body.profile);
  });
});
