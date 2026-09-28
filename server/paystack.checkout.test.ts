import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));

vi.mock("./_core/env", () => ({ ENV: { paystackSecretKey: "checkout-secret" } }));
vi.mock("./supabase", () => ({ supabaseAdminRequest: supabaseRequest }));

import { TEST_INSTALLMENT_PLAN } from "./testing/paystackPlans";
import { ABANDONED_CHECKOUT_CUTOFF_MS, initializeCheckout } from "./paystack";

const checkout = { userId: "learner-1", email: "learner@example.com", planCode: "full-access-3-month", callbackUrl: "https://spellcode.example/payment/complete" };

/**
 * The two tables the guard reads, as a scenario rather than a call order: it asks
 * two questions of two tables, and a test that pinned the sequence would have to be
 * rewritten every time the order changed rather than when the behaviour did.
 */
type StubbedRows = { subscriptions: Array<{ status: string }>; payments: Array<{ status: string; created_at: string }> };

/** A timestamp `ageMs` in the past, so a row's age is stated in the terms the cutoff is. */
const aged = (ageMs: number) => new Date(Date.now() - ageMs).toISOString();

/**
 * The states one guard query asks for, or a failure naming the query that asked for
 * none. An unfiltered read answers every row a Learner ever had, which is a refusal
 * nothing can lift; waving it through here would let that pass as a guard.
 */
function statusFilterOf(path: string, guard: string) {
  const states = /status=(?:eq\.([a-z_]+)|in\.\(([^)]*)\))/.exec(path);
  if (!states) throw new Error(`the ${guard} guard carried no status filter: ${path}`);
  return states[1] ? [states[1]] : states[2].split(",");
}

describe("starting a checkout", () => {
  let rows: StubbedRows;

  beforeEach(() => {
    rows = { subscriptions: [], payments: [] };
    supabaseRequest.mockReset();
    supabaseRequest.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path.includes("/rest/v1/plans?code=eq.")) return [TEST_INSTALLMENT_PLAN];
      if (path.includes("/rest/v1/subscriptions?user_id")) {
        const wanted = statusFilterOf(path, "access");
        return rows.subscriptions.filter(row => wanted.includes(row.status)).slice(0, 1);
      }
      if (path.includes("/rest/v1/payment_transactions?user_id")) {
        const wanted = statusFilterOf(path, "in-progress");
        // The guard must bound the rows it reads by age too, or an abandoned checkout
        // bars the plan forever - the lockout this ticket exists to remove.
        const since = /created_at=gte\.([^&]+)/.exec(path);
        if (!since) throw new Error(`the in-progress guard carried no age filter: ${path}`);
        const cutoff = decodeURIComponent(since[1]);
        return rows.payments.filter(row => wanted.includes(row.status) && row.created_at >= cutoff).slice(0, 1);
      }
      if (path.includes("/rest/v1/payment_transactions") && init?.method === "POST") return [{ id: "payment-1" }];
      return [];
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: true, data: { authorization_url: "https://checkout.paystack.com/abc", access_code: "abc", reference: "spellcode-ref" } }), { headers: { "Content-Type": "application/json" } })));
  });

  const writesTo = (table: string) => supabaseRequest.mock.calls.filter(([path, init]: [string, { method?: string }?]) => path.includes(`/rest/v1/${table}`) && init?.method === "POST");

  // A Learner who opened the Paystack page holds nothing, so there is nothing to record
  // about them but the attempt. Writing a Subscription here is what produced the lockout:
  // the row was never cleared and the guard read it as "already paying".
  it("writes no Subscription row, only the payment record", async () => {
    await expect(initializeCheckout(checkout)).resolves.toMatchObject({ reference: "spellcode-ref", paymentId: "payment-1" });

    expect(writesTo("subscriptions")).toHaveLength(0);
    expect(writesTo("payment_transactions")).toHaveLength(1);
  });

  it("refuses a Learner who already holds the plan in good standing", async () => {
    rows.subscriptions = [{ status: "active" }];
    await expect(initializeCheckout(checkout)).rejects.toThrow("You already have access through this plan.");
  });

  it("refuses a Learner whose Subscription is behind on payment rather than selling them a second one", async () => {
    rows.subscriptions = [{ status: "past_due" }];
    await expect(initializeCheckout(checkout)).rejects.toThrow("You already have access through this plan.");
  });

  it("refuses a Learner whose checkout is still live, distinguishably from one who already has access", async () => {
    rows.payments = [{ status: "initialized", created_at: aged(5 * 60 * 1000) }];
    await expect(initializeCheckout(checkout)).rejects.toThrow("A payment for this plan is already in progress.");

    rows = { subscriptions: [{ status: "active" }], payments: [] };
    // Two questions, two answers. One message for both is what hid the lockout: a Learner
    // barred by a dead row was told they already had access they did not have.
    await expect(initializeCheckout(checkout)).rejects.not.toThrow("A payment for this plan is already in progress.");
  });

  // Both boundary tests read the exported cutoff rather than restating two hours, because
  // the point of the constant is that this guard and ticket 35's sweep cannot drift apart. A
  // test carrying its own 7200000 would keep passing after one of them moved.
  it("lets a Learner start again once their abandoned checkout is past the cutoff", async () => {
    rows.payments = [{ status: "initialized", created_at: aged(ABANDONED_CHECKOUT_CUTOFF_MS + 60 * 1000) }];
    await expect(initializeCheckout(checkout)).resolves.toMatchObject({ reference: "spellcode-ref" });
  });

  it("still refuses a checkout that is only just inside the cutoff", async () => {
    rows.payments = [{ status: "initialized", created_at: aged(ABANDONED_CHECKOUT_CUTOFF_MS - 60 * 1000) }];
    await expect(initializeCheckout(checkout)).rejects.toThrow("A payment for this plan is already in progress.");
  });

  // An attempt Paystack has already resolved is over, whatever its age. Widening the guard to
  // ticket 33's unsettled states would refuse a retry after a declined card for two hours -
  // see ADR 0005 for why the two state sets are deliberately different sizes.
  it("does not treat a resolved attempt as one in progress", async () => {
    for (const status of ["failed", "abandoned", "success", "refunded"]) {
      rows.payments = [{ status, created_at: aged(60 * 1000) }];
      await expect(initializeCheckout(checkout), `a ${status} transaction must not block a new checkout`).resolves.toMatchObject({ reference: "spellcode-ref" });
    }
  });

  it("never reaches Paystack when the guard refuses", async () => {
    rows.subscriptions = [{ status: "active" }];
    await expect(initializeCheckout(checkout)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
