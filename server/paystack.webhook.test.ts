import crypto from "node:crypto";
import type express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest, payments, subscription } = vi.hoisted(() => ({
  payments: new Map<string, { id: string; user_id: string; plan_id: string; paystack_reference: string; amount_minor: number; currency: string; status: string }>(),
  subscription: { installments_paid: 1 },
  supabaseRequest: vi.fn(),
}));

vi.mock("./_core/env", () => ({ ENV: { paystackSecretKey: "webhook-secret" } }));
vi.mock("./supabase", () => ({ supabaseAdminRequest: supabaseRequest }));

import { createSpellCodeApp } from "./app";

const event = { event: "charge.success", data: { id: 9002, reference: "renewal-002", amount: 4000000, currency: "NGN", paid_at: "2026-08-15T00:00:00.000Z", metadata: { user_id: "learner-1", plan_code: "full-access-3-month" }, plan: { plan_code: "PLN_3MONTH" }, customer: { customer_code: "CUS_123" }, authorization: { authorization_code: "AUTH_123" } } };

describe("Paystack recurring webhook route", () => {
  let app: express.Express;
  beforeEach(() => {
    payments.clear(); subscription.installments_paid = 1; supabaseRequest.mockReset();
    supabaseRequest.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      if (path.includes("paystack_webhook_events?on_conflict")) return [];
      if (path.includes("paystack_webhook_events?event_id")) return [];
      if (path.includes("payment_transactions?paystack_reference")) return payments.has("renewal-002") ? [payments.get("renewal-002")] : [];
      if (path.includes("plans?paystack_plan_code")) return [{ id: "plan-1", code: "full-access-3-month", name: "Full Access", currency: "NGN", amount_minor: 4000000, interval: "monthly", max_installments: 3, paystack_plan_code: "PLN_3MONTH", is_active: true }];
      if (path.includes("subscriptions?user_id") && path.includes("select=id,user_id,plan_id")) return [{ id: "sub-1", user_id: "learner-1", plan_id: "plan-1" }];
      if (path.includes("payment_transactions?on_conflict")) { const record = { id: "payment-2", user_id: body.user_id, plan_id: body.plan_id, paystack_reference: body.paystack_reference, amount_minor: body.amount_minor, currency: body.currency, status: "initialized" }; payments.set(record.paystack_reference, record); return [record]; }
      if (path.includes("payment_transactions?id") && init?.method === "PATCH") { const record = payments.get("renewal-002"); if (record) record.status = body.status; return []; }
      if (path.includes("plans?id=eq.plan-1")) return [{ id: "plan-1", interval: "monthly", max_installments: 3 }];
      if (path.includes("subscriptions?user_id") && path.includes("installments_paid")) return [{ id: "sub-1", installments_paid: subscription.installments_paid, installments_due: 3 }];
      if (path.includes("subscriptions?id=eq.sub-1") && init?.method === "PATCH") { subscription.installments_paid = body.installments_paid; return []; }
      return [];
    });
    app = createSpellCodeApp();
  });

  /** The real application, because the raw-body capture the signature depends on lives in it. */
  async function postEvent(body = JSON.stringify(event)) {
    const signature = crypto.createHmac("sha512", "webhook-secret").update(Buffer.from(body)).digest("hex");
    const server = await new Promise<ReturnType<express.Express["listen"]>>(resolve => { const instance = app.listen(0, () => resolve(instance)); });
    const address = server.address(); const port = typeof address === "object" && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/api/paystack/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-paystack-signature": signature }, body });
    await new Promise<void>(resolve => server.close(() => resolve())); return response;
  }

  it("creates one recurring transaction and increments installments once for a unique charge", async () => {
    await expect(postEvent()).resolves.toMatchObject({ status: 200 });
    expect(payments.get("renewal-002")?.status).toBe("success");
    expect(subscription.installments_paid).toBe(2);
  });

  // Paystack signs the bytes it sends, and those bytes do not survive a JSON round trip: spacing,
  // key order and \uXXXX escaping are all lost. So this body is signed in a form that
  // JSON.stringify(req.body) cannot reproduce, and it passes only if the route verified the raw
  // request rather than a re-serialised object.
  it("accepts a signed body whose bytes differ from its re-serialised form", async () => {
    const wireFormat = JSON.stringify(event, null, 2).replace('"NGN"', '"NG\\u004e"');
    expect(wireFormat).not.toBe(JSON.stringify(JSON.parse(wireFormat)));
    await expect(postEvent(wireFormat)).resolves.toMatchObject({ status: 200 });
    expect(payments.get("renewal-002")?.status).toBe("success");
  });

  it("does not add a second installment when Paystack replays the same signed webhook", async () => {
    await postEvent(); await expect(postEvent()).resolves.toMatchObject({ status: 200 });
    expect(payments).toHaveLength(1);
    expect(subscription.installments_paid).toBe(2);
  });
});
