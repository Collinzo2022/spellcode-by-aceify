import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubRequest } from "./testing/request";
import { createSupabaseStub } from "./testing/supabaseStub";
import { makeSessionUser } from "./learner";

const { supabase } = vi.hoisted(() => ({
  supabase: { current: null as ReturnType<typeof import("./testing/supabaseStub").createSupabaseStub> | null },
}));

vi.mock("./supabase", () => ({ supabaseAdminRequest: (path: string, init?: RequestInit) => supabase.current!.request(path, init) }));

import { billingRouter } from "./routers/billing";

const plan = (code: string, is_active: boolean) => ({ id: `id-${code}`, code, name: code, currency: "NGN", amount_minor: 100, interval: code === "full-access-one-time" ? "one_time" : "monthly", max_installments: 1, paystack_plan_code: null, is_active });
const ONE_TIME = plan("full-access-one-time", true);
const THREE_MONTH = plan("full-access-3-month", false);

const anonymous = { user: null, req: stubRequest(), res: {} } as any;
const admin = { user: makeSessionUser({ learnerId: "admin-1", name: "Admin", email: "admin@example.com", role: "admin" }), req: stubRequest(), res: {} } as any;

let stub: ReturnType<typeof createSupabaseStub>;

// Every plan is staged on the bare plans path, and only the active one on a path
// carrying the active filter. A query that drops the filter falls through to the
// bare path, gets the inactive plan back, and fails here - the same idiom
// grantFullAccess uses for its status filter.
beforeEach(() => {
  stub = createSupabaseStub("admin-1");
  supabase.current = stub;
  stub.stageRows(/^\/rest\/v1\/plans\?/, [ONE_TIME, THREE_MONTH]);
  stub.stageRows(/^\/rest\/v1\/plans\?.*is_active=eq\.true/, [ONE_TIME]);
});

describe("the plans offered to a Learner", () => {
  it("leave out a plan nobody can buy", async () => {
    // initializeCheckout refuses an inactive plan, so listing one shows a
    // Learner a button that can only fail. The 3-month plan was featured on the
    // Access page while inactive (found 2026-11-12).
    const plans = await billingRouter.createCaller(anonymous).accessOptions();

    expect(plans.map(row => row.code)).toEqual(["full-access-one-time"]);
  });

  it("still show an operator every plan, so an inactive one can be switched back on", async () => {
    const plans = await billingRouter.createCaller(admin).adminPlans();

    expect(plans.map(row => row.code)).toEqual(["full-access-one-time", "full-access-3-month"]);
  });
});
