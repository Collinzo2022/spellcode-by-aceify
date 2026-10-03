import crypto from "node:crypto";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest, payments, subscription, createdSubscriptions, race } = vi.hoisted(() => ({
  payments: new Map<string, { id: string; user_id: string; plan_id: string; paystack_reference: string; amount_minor: number; currency: string; status: string }>(),
  /** `present: false` models a Learner whose first payment is landing, the path every checkout takes since ticket 34. */
  subscription: { installments_paid: 1, present: true },
  createdSubscriptions: [] as Array<Record<string, unknown>>,
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
import { TEST_INSTALLMENT_PLAN } from "./testing/paystackPlans";

const prefersRepresentation = (init?: { headers?: HeadersInit }) => new Headers(init?.headers).get("Prefer")?.includes("return=representation") ?? false;

/**
 * Deliver a signed webhook to a real socket, the way Paystack would.
 *
 * The real application is used rather than a bare router, because the raw-body capture the signature
 * depends on lives in it: a signature verified against `JSON.stringify(req.body)` is verified against
 * bytes nobody sent. `body` is passed as a string so a caller can sign a form that does not survive a
 * JSON round trip.
 */
async function deliverSignedEvent(app: express.Express, body: string) {
  const signature = crypto.createHmac("sha512", "webhook-secret").update(Buffer.from(body)).digest("hex");
  const server = await new Promise<ReturnType<express.Express["listen"]>>(resolve => { const instance = app.listen(0, () => resolve(instance)); });
  const address = server.address(); const port = typeof address === "object" && address ? address.port : 0;
  const response = await fetch(`http://127.0.0.1:${port}/api/paystack/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-paystack-signature": signature }, body });
  await new Promise<void>(resolve => server.close(() => resolve()));
  return response;
}

const event = { event: "charge.success", data: { id: 9002, reference: "renewal-002", amount: 4000000, currency: "NGN", paid_at: "2026-08-15T00:00:00.000Z", metadata: { user_id: "learner-1", plan_code: "full-access-3-month" }, plan: { plan_code: "PLN_3MONTH" }, customer: { customer_code: "CUS_123" }, authorization: { authorization_code: "AUTH_123" } } };

describe("Paystack recurring webhook route", () => {
  let app: express.Express;
  beforeEach(() => {
    payments.clear(); subscription.installments_paid = 1; subscription.present = true; createdSubscriptions.length = 0; race.staleRead = false; supabaseRequest.mockReset();
    supabaseRequest.mockImplementation(async (path: string, init?: { method?: string; body?: string; headers?: HeadersInit }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      if (path.includes("paystack_webhook_events?on_conflict")) return [];
      if (path.includes("paystack_webhook_events?event_id")) return [];
      if (path.includes("payment_transactions?paystack_reference")) {
        const record = payments.get("renewal-002");
        if (!record) return [];
        return [race.staleRead ? { ...record, status: "initialized" } : record];
      }
      if (path.includes("plans?paystack_plan_code")) return [TEST_INSTALLMENT_PLAN];
      if (path.includes("subscriptions?user_id") && path.includes("select=id,user_id,plan_id")) return subscription.present ? [{ id: "sub-1", user_id: "learner-1", plan_id: "plan-1" }] : [];
      if (path === "/rest/v1/subscriptions" && init?.method === "POST") { createdSubscriptions.push(body); return []; }
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
      if (path.includes("plans?id=eq.plan-1")) return [{ id: "plan-1", code: "full-access-3-month", interval: "monthly", max_installments: 3 }];
      if (path.includes("subscriptions?user_id") && path.includes("installments_paid")) return subscription.present ? [{ id: "sub-1", installments_paid: subscription.installments_paid, installments_due: 3 }] : [];
      if (path.includes("subscriptions?id=eq.sub-1") && init?.method === "PATCH") { subscription.installments_paid = body.installments_paid; return []; }
      return [];
    });
    app = createSpellCodeApp();
  });

  const postEvent = (body = JSON.stringify(event)) => deliverSignedEvent(app, body);

  it("creates one recurring transaction and increments installments once for a unique charge", async () => {
    await expect(postEvent()).resolves.toMatchObject({ status: 200 });
    expect(payments.get("renewal-002")?.status).toBe("success");
    expect(subscription.installments_paid).toBe(2);
  });

  // Since ticket 34 a checkout writes no Subscription, so this branch carries every Learner's
  // first payment rather than being the rare one. A Learner who pays and gets no Subscription is
  // the worst outcome the payment path has, and nothing else in the suite exercises the create.
  it("creates the Subscription when the verified payment is the Learner's first", async () => {
    payments.set("renewal-002", { id: "payment-1", user_id: "learner-1", plan_id: "plan-1", paystack_reference: "renewal-002", amount_minor: 4000000, currency: "NGN", status: "initialized" });
    subscription.present = false;

    await expect(postEvent()).resolves.toMatchObject({ status: 200 });

    expect(createdSubscriptions).toHaveLength(1);
    expect(createdSubscriptions[0]).toMatchObject({ user_id: "learner-1", plan_id: "plan-1", status: "active", installments_paid: 1, installments_due: 3 });
    // The checkout write that used to snapshot the plan code is gone, so this branch has to.
    // Nothing reads the column yet, which is exactly why its loss would go unnoticed.
    expect(createdSubscriptions[0].plan_snapshot).toMatchObject({ plan_code: "full-access-3-month" });
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

/**
 * A verified charge whose plan matches no row in `plans`.
 *
 * This is the hazard ticket 32 and ADR 0004 both name: `paystack_plan_code` holds one mode's code,
 * so a charge in the other mode arrives, verifies, matches nothing, and used to be dropped on an
 * early `return null`. The event body was stored either way, which reads like a safety net and is
 * not one - the route then patched `processed_at` regardless, so a dropped charge was recorded as
 * handled, with `processing_error: null`, indistinguishable from one that granted access.
 *
 * ADR 0004 closes the circumstance by keeping production in one mode, and says so explicitly:
 * "This decision removes the circumstance rather than the failure mode". These tests are about the
 * failure mode, which outlives the cutover - a plan can be unconfigured for reasons that have
 * nothing to do with mode.
 */
describe("Paystack webhook events that land nowhere", () => {
  let app: express.Express;
  /** Every `processing_error` the route wrote, and whether it ever claimed the event was processed. */
  let reasons: string[];
  let markedProcessed: boolean;
  /** Whether the route ever wrote `processing_error: null`, which is how a self-healed retry reads. */
  let clearedReason: boolean;
  /** Plan codes the stub knows. Empty models the unconfigured column; the route must not invent one. */
  let knownPlanCodes: string[];
  let subscriptionExists: boolean;

  beforeEach(() => {
    reasons = []; markedProcessed = false; clearedReason = false; knownPlanCodes = []; subscriptionExists = true;
    supabaseRequest.mockReset();
    supabaseRequest.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      if (path.includes("paystack_webhook_events?event_id") && init?.method === "PATCH") {
        if (typeof body.processing_error === "string") reasons.push(body.processing_error);
        if (body.processing_error === null) clearedReason = true;
        if (body.processed_at) markedProcessed = true;
        return [];
      }
      if (path.includes("plans?paystack_plan_code")) {
        const code = /paystack_plan_code=eq\.([^&]*)/.exec(path)?.[1] ?? "";
        return knownPlanCodes.includes(decodeURIComponent(code)) ? [TEST_INSTALLMENT_PLAN] : [];
      }
      if (path.includes("subscriptions?") && init?.method !== "PATCH") return subscriptionExists ? [{ id: "sub-1", user_id: "learner-1", plan_id: "plan-1", installments_paid: 1, installments_due: 3 }] : [];
      if (path.includes("payment_transactions?on_conflict")) return [{ id: "payment-2", user_id: "learner-1", plan_id: "plan-1", paystack_reference: "renewal-002", amount_minor: 4000000, currency: "NGN", status: "initialized" }];
      if (path.includes("payment_transactions?id") && init?.method === "PATCH") return [{ id: "payment-2", user_id: "learner-1", plan_id: "plan-1", paystack_reference: "renewal-002", amount_minor: 4000000, currency: "NGN", status: "success" }];
      if (path.includes("plans?id=eq.plan-1")) return [{ id: "plan-1", code: "full-access-3-month", interval: "monthly", max_installments: 3 }];
      return [];
    });
    app = createSpellCodeApp();
  });

  const post = (body: unknown) => deliverSignedEvent(app, JSON.stringify(body));

  // The plan code is the whole diagnosis. A human reading this row has to compare it against
  // `plans.paystack_plan_code` to see that one is a live `PLN_` and the other a test one, so a
  // reason that omits it ("plan not found") sends them back to the dashboard to guess.
  it("records which plan code matched nothing when a verified charge lands nowhere", async () => {
    await post(event);

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("PLN_3MONTH");
  });

  // The defect this whole describe exists for. `processed_at` is the column anyone auditing the
  // payment path reads first, and a dropped charge that sets it is worse than one that writes
  // nothing at all: it answers the question "did we handle this?" with a confident yes.
  it("does not claim a dropped charge was processed", async () => {
    await post(event);

    expect(markedProcessed).toBe(false);
  });

  // The other half of being distinguishable, and the one that fails if the fix throws too widely.
  it("still marks a charge it handled as processed, with no reason recorded", async () => {
    knownPlanCodes = ["PLN_3MONTH"];

    await expect(post(event)).resolves.toMatchObject({ status: 200 });

    expect(markedProcessed).toBe(true);
    expect(reasons).toEqual([]);
  });

  // Paystack's own webhook log is a second place a human looks, independent of the database, and it
  // records the response. Answering 200 to a charge we dropped shows green there too, which hides
  // the fault in both places at once.
  it("refuses the delivery rather than answering 200 for a charge it dropped", async () => {
    await expect(post(event)).resolves.toMatchObject({ status: 500 });
  });

  // `updateSubscriptionLifecycle` carries the same lookup and the same early return. Its events do
  // not move money, so this is the quieter half - but a renewal that silently fails to extend a
  // Subscription revokes access from someone who paid.
  it("records why a subscription lifecycle event could not be applied", async () => {
    await post({ event: "subscription.create", data: { customer: { customer_code: "CUS_123" }, plan: { plan_code: "PLN_6MONTH" }, subscription_code: "SUB_1", status: "active" } });

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("PLN_6MONTH");
    expect(markedProcessed).toBe(false);
  });

  // Not every early return is a fault, and throwing on all of them would turn ordinary traffic into
  // 500s and retries. An `invoice.update` carrying no plan is Paystack telling us something we have
  // no branch for, which is the documented shape of an event we ignore - the connectivity probe in
  // ticket 25 was exactly this and is deliberately still in production.
  it("leaves an event it was never going to act on alone", async () => {
    await expect(post({ event: "invoice.update", data: { customer: { customer_code: "CUS_123" } } })).resolves.toMatchObject({ status: 200 });

    expect(reasons).toEqual([]);
    expect(markedProcessed).toBe(true);
  });

  // The asymmetry between the two `!subscription` lookups, pinned from both sides. This one must NOT
  // throw: since ticket 34 a checkout writes no Subscription - `recordVerifiedPayment` does, on
  // `charge.success` - so a `subscription.create` that outruns the charge finds nothing, and that is
  // the ordinary first-installment interleaving. An earlier draft of this fix threw here, which
  // would have answered 500 on the happy path of every installment plan.
  it("lets a lifecycle event that outran the charge pass without comment", async () => {
    knownPlanCodes = ["PLN_6MONTH"];
    subscriptionExists = false;

    await expect(post({ event: "subscription.create", data: { customer: { customer_code: "CUS_123" }, plan: { plan_code: "PLN_6MONTH" }, subscription_code: "SUB_1", status: "active" } })).resolves.toMatchObject({ status: 200 });

    expect(reasons).toEqual([]);
    expect(markedProcessed).toBe(true);
  });

  // The other side: a charge whose reference has no payment row is a renewal, not a first payment,
  // so the Subscription it renews must already exist. Money has moved here, which is why this miss
  // is recorded where the one above is not.
  it("records a renewal charge that belongs to no Subscription", async () => {
    knownPlanCodes = ["PLN_3MONTH"];
    subscriptionExists = false;

    await expect(post(event)).resolves.toMatchObject({ status: 500 });

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("PLN_3MONTH");
    expect(markedProcessed).toBe(false);
  });

  // The self-healing case ADR 0004's cutover makes real: the operator patches
  // `plans.paystack_plan_code`, Paystack retries, and the event goes through. The row must then read
  // as handled and nothing else - carrying both `processed_at` and the old `processing_error` is
  // ambiguous to the one person who reads this table.
  it("clears the recorded reason when a retry of the same event succeeds", async () => {
    await expect(post(event)).resolves.toMatchObject({ status: 500 });
    expect(reasons).toHaveLength(1);

    knownPlanCodes = ["PLN_3MONTH"];
    await expect(post(event)).resolves.toMatchObject({ status: 200 });

    expect(markedProcessed).toBe(true);
    expect(clearedReason).toBe(true);
  });
});
