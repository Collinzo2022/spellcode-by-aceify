import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));

vi.mock("./_core/env", () => ({ ENV: { paystackSecretKey: "verify-secret" } }));
vi.mock("./supabase", () => ({ supabaseAdminRequest: supabaseRequest }));

import { verifyCheckout } from "./paystack";
import { TEST_INSTALLMENT_PLAN } from "./testing/paystackPlans";

/**
 * The browser return leg, which had no test at all until ticket 35 - every payment
 * test drove the webhook instead. It is one of the two nets a paid Learner depends
 * on, and it was the uncovered one.
 */
describe("the browser return leg", () => {
  let payment: { id: string; user_id: string; plan_id: string | null; paystack_reference: string; amount_minor: number; currency: string; status: string };
  let upstream: { status: string; amount: number; currency: string };
  let subscriptionPatches: Array<Record<string, unknown>>;
  let subscriptionCreates: Array<Record<string, unknown>>;

  beforeEach(() => {
    payment = { id: "payment-1", user_id: "learner-1", plan_id: "plan-1", paystack_reference: "spellcode-ref", amount_minor: 4000000, currency: "NGN", status: "initialized" };
    upstream = { status: "success", amount: 4000000, currency: "NGN" };
    subscriptionPatches = []; subscriptionCreates = [];
    supabaseRequest.mockReset();
    supabaseRequest.mockImplementation(async (path: string, init?: { method?: string; body?: string; headers?: HeadersInit }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      if (path.includes("payment_transactions?paystack_reference")) return [payment];
      if (path.includes("payment_transactions?id") && init?.method === "PATCH") {
        // As ticket 33 left it: the filter is applied to the update, so a row that has
        // moved on is neither written nor echoed back.
        const states = /status=in\.\(([^)]*)\)/.exec(path);
        if (!states) throw new Error(`payment transition carried no status filter: ${path}`);
        if (!new Headers(init.headers).get("Prefer")?.includes("return=representation")) return undefined;
        if (!states[1].split(",").includes(payment.status)) return [];
        payment.status = body.status;
        return [payment];
      }
      // The re-read that tells a lost write apart from a refusal to grant.
      if (path.includes("payment_transactions?id") && !init?.method) return [{ status: payment.status }];
      if (path.includes("plans?id=eq.plan-1")) return [TEST_INSTALLMENT_PLAN];
      if (path.includes("subscriptions?user_id")) return [];
      if (path === "/rest/v1/subscriptions" && init?.method === "POST") { subscriptionCreates.push(body); return []; }
      if (path.includes("subscriptions?id") && init?.method === "PATCH") { subscriptionPatches.push(body); return []; }
      return [];
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: true, data: { id: 5001, paid_at: "2026-09-28T10:00:00.000Z", authorization: { authorization_code: "AUTH_1" }, customer: { customer_code: "CUS_1" }, ...upstream } }), { headers: { "Content-Type": "application/json" } })));
  });

  it("grants Full Access and reports it when Paystack has the money", async () => {
    await expect(verifyCheckout("spellcode-ref", "learner-1")).resolves.toMatchObject({ verified: true });
    expect(payment.status).toBe("success");
    expect(subscriptionCreates).toHaveLength(1);
    expect(subscriptionCreates[0]).toMatchObject({ status: "active", installments_paid: 1 });
  });

  // The ownership check is the whole reason this leg is separate from the sweep's
  // verification: a browser request carries a Learner, and one Learner must not be able
  // to settle another's reference by pasting it into their own return URL.
  it("refuses a reference that belongs to another Learner", async () => {
    await expect(verifyCheckout("spellcode-ref", "learner-2")).rejects.toThrow("Payment transaction not found.");
    expect(fetch).not.toHaveBeenCalled();
    expect(payment.status).toBe("initialized");
  });

  it("reports success when another writer settled the payment first", async () => {
    payment.status = "success";
    await expect(verifyCheckout("spellcode-ref", "learner-1")).resolves.toMatchObject({ verified: true });
    expect(subscriptionCreates).toHaveLength(0);
  });

  // The latent defect ticket 33's review recorded and left here. Since that ticket a
  // payment already settled as `refunded` or `disputed` is deliberately not granted - the
  // conditional write matches nothing - yet the leg used to answer `verified: true`
  // anyway, because it reported what Paystack said rather than what the write did.
  it("does not report success for a payment whose money was already unwound", async () => {
    payment.status = "refunded";
    await expect(verifyCheckout("spellcode-ref", "learner-1")).rejects.toThrow(/does not grant access/);
    expect(subscriptionCreates).toHaveLength(0);
    expect(subscriptionPatches).toHaveLength(0);
    expect(payment.status).toBe("refunded");
  });

  it("refuses when Paystack has not taken the money", async () => {
    upstream = { status: "abandoned", amount: 4000000, currency: "NGN" };
    await expect(verifyCheckout("spellcode-ref", "learner-1")).rejects.toThrow("Payment has not been verified yet.");
    expect(payment.status).toBe("initialized");
  });

  it("refuses a success whose amount does not match the Plan", async () => {
    upstream = { status: "success", amount: 100, currency: "NGN" };
    await expect(verifyCheckout("spellcode-ref", "learner-1")).rejects.toThrow("Payment has not been verified yet.");
    expect(payment.status).toBe("initialized");
    expect(subscriptionCreates).toHaveLength(0);
  });

  it("refuses a success paid in a different currency", async () => {
    upstream = { status: "success", amount: 4000000, currency: "USD" };
    await expect(verifyCheckout("spellcode-ref", "learner-1")).rejects.toThrow("Payment has not been verified yet.");
    expect(subscriptionCreates).toHaveLength(0);
  });
});
