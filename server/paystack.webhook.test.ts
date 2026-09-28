import crypto from "node:crypto";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest, payments, subscription, race } = vi.hoisted(() => ({
  payments: new Map<string, { id: string; user_id: string; plan_id: string; paystack_reference: string; amount_minor: number; currency: string; status: string }>(),
  subscription: { installments_paid: 1 },
  /**
   * Model a second writer that won the race between this request's read and its
   * write: reads answer the row as it was, writes meet the row as it now is.
   */
  race: { staleRead: false },
  supabaseRequest: vi.fn(),
}));

vi.mock("./_core/env", () => ({ ENV: { paystackSecretKey: "webhook-secret" } }));
vi.mock("./supabase", () => ({ supabaseAdminRequest: supabaseRequest }));

import { createSpellCodeApp } from "./app";
import { registerPaystackWebhook } from "./paystack";

const prefersRepresentation = (init?: { headers?: HeadersInit }) => new Headers(init?.headers).get("Prefer")?.includes("return=representation") ?? false;

const event = { event: "charge.success", data: { id: 9002, reference: "renewal-002", amount: 4000000, currency: "NGN", paid_at: "2026-08-15T00:00:00.000Z", metadata: { user_id: "learner-1", plan_code: "full-access-3-month" }, plan: { plan_code: "PLN_3MONTH" }, customer: { customer_code: "CUS_123" }, authorization: { authorization_code: "AUTH_123" } } };

describe("Paystack recurring webhook route", () => {
  let app: express.Express;
  beforeEach(() => {
    payments.clear(); subscription.installments_paid = 1; race.staleRead = false; supabaseRequest.mockReset();
    supabaseRequest.mockImplementation(async (path: string, init?: { method?: string; body?: string; headers?: HeadersInit }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      if (path.includes("paystack_webhook_events?on_conflict")) return [];
      if (path.includes("paystack_webhook_events?event_id")) return [];
      if (path.includes("payment_transactions?paystack_reference")) {
        const record = payments.get("renewal-002");
        if (!record) return [];
        return [race.staleRead ? { ...record, status: "initialized" } : record];
      }
      if (path.includes("plans?paystack_plan_code")) return [{ id: "plan-1", code: "full-access-3-month", name: "Full Access", currency: "NGN", amount_minor: 4000000, interval: "monthly", max_installments: 3, paystack_plan_code: "PLN_3MONTH", is_active: true }];
      if (path.includes("subscriptions?user_id") && path.includes("select=id,user_id,plan_id")) return [{ id: "sub-1", user_id: "learner-1", plan_id: "plan-1" }];
      if (path.includes("payment_transactions?on_conflict")) { const record = { id: "payment-2", user_id: body.user_id, plan_id: body.plan_id, paystack_reference: body.paystack_reference, amount_minor: body.amount_minor, currency: body.currency, status: "initialized" }; payments.set(record.paystack_reference, record); return [record]; }
      // PostgREST applies the request's own filters to the UPDATE, so a row that no longer matches
      // them is not written and is not echoed back. A stub that always wrote would hide exactly the
      // interleaving this guards against. It also answers 204 - which the Supabase helper turns
      // into `undefined` - unless the caller asked for the rows back, so dropping that header has
      // to be reproducible here or no test could catch it.
      if (path.includes("payment_transactions?id") && init?.method === "PATCH") {
        if (!prefersRepresentation(init)) return undefined;
        const record = payments.get("renewal-002");
        if (!record) return [];
        const statusFilter = /status=in\.\(([^)]*)\)/.exec(path);
        // An unfiltered update writes every row it addresses. Failing here rather than waving it
        // through keeps a dropped filter from making the guard tests pass for no reason.
        if (!statusFilter) throw new Error(`payment_transactions PATCH carried no status filter: ${path}`);
        if (!statusFilter[1].split(",").includes(record.status)) return [];
        record.status = body.status;
        return [record];
      }
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

  // The route used to fall back to Buffer.from(JSON.stringify(req.body)) when the raw body was
  // missing, which verifies a signature against bytes nobody sent and happens to agree only when
  // the payload survives a JSON round trip. An app assembled without the capture must now be
  // refused outright, so the mistake surfaces as a dead webhook rather than as one that works
  // until a payload stops round-tripping.
  it("refuses a signed webhook when the app was assembled without the raw-body capture", async () => {
    app = express();
    app.use(express.json());
    registerPaystackWebhook(app);
    await expect(postEvent()).resolves.toMatchObject({ status: 401 });
    expect(payments.size).toBe(0);
  });

  it("does not add a second installment when Paystack replays the same signed webhook", async () => {
    await postEvent(); await expect(postEvent()).resolves.toMatchObject({ status: 200 });
    expect(payments).toHaveLength(1);
    expect(subscription.installments_paid).toBe(2);
  });

  // The replay above is caught by reading the payment's status first, which only works because
  // the read happens to see the write that preceded it. Two writers racing do not get that:
  // both read `initialized`, so both pass the status check, and the second one advances the
  // installment a second time for one payment. Only a condition carried on the write itself can
  // refuse that, so this stages the read and the write disagreeing on purpose.
  it("does not add a second installment when another writer settled the payment first", async () => {
    await postEvent();
    expect(subscription.installments_paid).toBe(2);

    race.staleRead = true;
    await expect(postEvent()).resolves.toMatchObject({ status: 200 });

    expect(payments.get("renewal-002")?.status).toBe("success");
    expect(subscription.installments_paid).toBe(2);
  });

  // A checkout the sweep gave up on is not finished: a Learner who returns to the same Paystack
  // link can still pay, and that charge must be recorded. Restricting the write to `initialized`
  // alone would take their money and withhold the access, which is the failure this whole effort
  // exists to remove.
  it("records a payment that Paystack settles after the checkout was written off", async () => {
    await postEvent();
    const record = payments.get("renewal-002")!;
    record.status = "abandoned";
    subscription.installments_paid = 1;

    await expect(postEvent()).resolves.toMatchObject({ status: 200 });

    expect(record.status).toBe("success");
    expect(subscription.installments_paid).toBe(2);
  });

  // The guard reads how many rows the write touched, and PostgREST only says so when asked. Drop
  // that header and every payment looks like one another writer already took, which withholds
  // access from everybody at once and silently. So the route must ask, and must fail loudly rather
  // than guess when the answer is missing.
  it("asks the database how many rows the payment transition touched", async () => {
    await postEvent();
    const patch = supabaseRequest.mock.calls.find(([path, init]: [string, { method?: string }?]) => path.includes("payment_transactions?id") && init?.method === "PATCH");
    expect(patch).toBeDefined();
    expect(prefersRepresentation(patch![1])).toBe(true);
  });

  it("refuses to treat an unanswered payment transition as a lost race", async () => {
    const recorded: string[] = [];
    supabaseRequest.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path.includes("payment_transactions?paystack_reference")) return [{ id: "payment-2", user_id: "learner-1", plan_id: "plan-1", paystack_reference: "renewal-002", amount_minor: 4000000, currency: "NGN", status: "initialized" }];
      // A PATCH that answered 204, as one that forgot to ask for its rows would.
      if (path.includes("payment_transactions?id") && init?.method === "PATCH") return undefined;
      if (path.includes("paystack_webhook_events?event_id") && init?.body?.includes("processing_error")) recorded.push(JSON.parse(init.body).processing_error);
      return [];
    });

    await expect(postEvent()).resolves.toMatchObject({ status: 500 });
    expect(subscription.installments_paid).toBe(1);
    // The durable record has to name the fault. Letting `undefined.length` throw on its own also
    // fails the request, but writes "Cannot read properties of undefined" to the one place a human
    // will look, which is how a one-line mistake becomes an afternoon.
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toContain("without asking for the affected rows");
  });
});
