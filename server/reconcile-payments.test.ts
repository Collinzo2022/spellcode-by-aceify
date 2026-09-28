import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));

// ENV is a plain object, so the file switches the scheduled-task secret on and off by
// assigning to it - the same seam server/testing/forge.ts uses for Forge.
vi.mock("./_core/env", () => ({ ENV: { paystackSecretKey: "sweep-paystack-key", scheduledTasksSecret: "cron-secret" } }));
vi.mock("./supabase", () => ({ supabaseAdminRequest: supabaseRequest }));

import { ENV } from "./_core/env";
import { ABANDONED_CHECKOUT_CUTOFF_MS } from "./paystack";
import { reconcileUnfinishedPayments, registerReconciliationEndpoint } from "./reconcilePayments";
import { TEST_INSTALLMENT_PLAN } from "./testing/paystackPlans";

type Row = { id: string; user_id: string; plan_id: string | null; paystack_reference: string; amount_minor: number; currency: string; status: string; created_at: string; reconciliation_error: string | null };

const aged = (ageMs: number) => new Date(Date.now() - ageMs).toISOString();
const LONG_DEAD = ABANDONED_CHECKOUT_CUTOFF_MS + 60 * 60 * 1000;
const STILL_FRESH = ABANDONED_CHECKOUT_CUTOFF_MS - 60 * 1000;

function paymentRow(over: Partial<Row> = {}): Row {
  return { id: "payment-1", user_id: "learner-1", plan_id: "plan-1", paystack_reference: "spellcode-ref", amount_minor: 4000000, currency: "NGN", status: "initialized", created_at: aged(LONG_DEAD), reconciliation_error: null, ...over };
}

describe("reconciling unfinished payments", () => {
  let rows: Row[];
  /** What Paystack answers per reference: a transaction, or a refusal to recognise it. */
  let upstream: Map<string, { status?: number; body: unknown }>;
  let subscriptionWrites: Array<Record<string, unknown>>;
  /**
   * Rows the candidate query answers with instead of `rows`, to stage a read that saw the
   * world as it was while the writes meet it as it now is.
   */
  let staleCandidates: Row[] | null;

  const answer = (over: Record<string, unknown> = {}) => ({ body: { status: true, data: { id: 7001, status: "success", amount: 4000000, currency: "NGN", paid_at: "2026-09-28T09:00:00.000Z", authorization: { authorization_code: "AUTH_9" }, customer: { customer_code: "CUS_9" }, ...over } } });

  beforeEach(() => {
    ENV.scheduledTasksSecret = "cron-secret";
    rows = [paymentRow()];
    upstream = new Map([["spellcode-ref", answer()]]);
    subscriptionWrites = [];
    staleCandidates = null;
    supabaseRequest.mockReset();
    supabaseRequest.mockImplementation(async (path: string, init?: { method?: string; body?: string; headers?: HeadersInit }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      const byId = /payment_transactions\?id=eq\.([\w-]+)/.exec(path);
      if (path.includes("payment_transactions?status=in.")) {
        // The candidate query must ask for every unfinished state, not `initialized` alone:
        // a checkout written off as abandoned can still be settled, and filtering it out
        // makes that path unreachable from the sweep (ticket 33).
        const states = /status=in\.\(([^)]*)\)/.exec(path)![1].split(",");
        expect(states).toEqual(expect.arrayContaining(["initialized", "abandoned", "failed"]));
        return (staleCandidates ?? rows).filter(row => states.includes(row.status));
      }
      if (byId && init?.method === "PATCH") {
        const row = rows.find(candidate => candidate.id === byId[1])!;
        const states = /status=in\.\(([^)]*)\)/.exec(path);
        if (states && !states[1].split(",").includes(row.status)) return [];
        // PostgREST applies `neq` to the update as well, so a row the filter excludes is not
        // written. The flag write relies on this to avoid stranding a flag on a settled payment.
        const excluded = /status=neq\.(\w+)/.exec(path);
        if (excluded && row.status === excluded[1]) return [];
        if (body.status !== undefined) row.status = body.status;
        if (body.reconciliation_error !== undefined) row.reconciliation_error = body.reconciliation_error;
        return new Headers(init.headers).get("Prefer")?.includes("return=representation") ? [row] : [];
      }
      if (byId && !init?.method) return [{ status: rows.find(candidate => candidate.id === byId[1])!.status }];
      if (path.includes("plans?id=eq.")) return [TEST_INSTALLMENT_PLAN];
      if (path.includes("subscriptions?user_id")) return [];
      if (path === "/rest/v1/subscriptions" && init?.method === "POST") { subscriptionWrites.push(body); return []; }
      return [];
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const reference = decodeURIComponent(String(url).split("/transaction/verify/")[1] ?? "");
      const reply = upstream.get(reference);
      if (!reply) return new Response(JSON.stringify({ status: false, message: "Transaction reference not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "Content-Type": "application/json" } });
    }));
  });

  it("records a payment Paystack took but the application never heard about", async () => {
    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ examined: 1, recorded: 1 });
    expect(rows[0].status).toBe("success");
    expect(subscriptionWrites).toHaveLength(1);
    expect(subscriptionWrites[0]).toMatchObject({ status: "active", installments_paid: 1, installments_due: 3 });
  });

  // The sweep and the webhook must leave a Learner in the same state. This is worth more than
  // every other criterion, so it is asserted against the write path rather than re-implemented:
  // the sweep grants by calling the same function the webhook does.
  it("grants through the shared write path rather than a second one", async () => {
    await reconcileUnfinishedPayments();
    const subscriptionCreate = supabaseRequest.mock.calls.filter(([path, init]: [string, { method?: string }?]) => path === "/rest/v1/subscriptions" && init?.method === "POST");
    expect(subscriptionCreate).toHaveLength(1);
    expect(subscriptionCreate[0][1].body).toContain('"plan_code":"full-access-3-month"');
  });

  // Delete the amount comparison and this grants access on a sum nobody checked.
  it("does not grant a success whose amount does not match, and flags it", async () => {
    upstream.set("spellcode-ref", answer({ amount: 100 }));
    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ mismatched: 1, recorded: 0 });
    expect(rows[0].status).toBe("initialized");
    expect(subscriptionWrites).toHaveLength(0);
    expect(rows[0].reconciliation_error).toMatch(/100 NGN/);
  });

  it("does not grant a success paid in another currency, and flags it", async () => {
    upstream.set("spellcode-ref", answer({ currency: "USD" }));
    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ mismatched: 1, recorded: 0 });
    expect(subscriptionWrites).toHaveLength(0);
    expect(rows[0].reconciliation_error).toMatch(/USD/);
  });

  // Paystack's own word for the death, not a flattening of it. "Nobody completed the checkout"
  // and "the card was declined" are different facts and only one describes a Learner worth
  // chasing; the payment state vocabulary already carries both.
  it("marks a dead checkout past the cutoff with Paystack's own outcome", async () => {
    upstream.set("spellcode-ref", answer({ status: "abandoned" }));
    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ died: 1 });
    expect(rows[0].status).toBe("abandoned");

    rows = [paymentRow({ status: "initialized", created_at: aged(LONG_DEAD) })];
    upstream.set("spellcode-ref", answer({ status: "failed" }));
    await reconcileUnfinishedPayments();
    expect(rows[0].status).toBe("failed");
  });

  // Collapsing the two cutoffs into one is the easy mistake: sweeping deaths as eagerly as
  // successes kills checkouts a Learner is still paying.
  it("leaves a dead checkout inside the cutoff alone", async () => {
    rows = [paymentRow({ created_at: aged(STILL_FRESH) })];
    upstream.set("spellcode-ref", answer({ status: "abandoned" }));
    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ died: 0, leftAlone: 1 });
    expect(rows[0].status).toBe("initialized");
    expect(rows[0].reconciliation_error).toBeNull();
  });

  // The other half of the same decision: a success has no age filter at all, because a paid
  // Learner is waiting and the cost of asking early is one wasted request.
  it("records a success with no regard for its age", async () => {
    rows = [paymentRow({ created_at: aged(30 * 1000) })];
    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ recorded: 1 });
    expect(rows[0].status).toBe("success");
  });

  it("leaves a checkout Paystack still calls live alone, without flagging it", async () => {
    rows = [paymentRow({ created_at: aged(STILL_FRESH) })];
    upstream.set("spellcode-ref", answer({ status: "ongoing" }));
    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ leftAlone: 1, unrecognised: 0 });
    expect(rows[0].status).toBe("initialized");
    expect(rows[0].reconciliation_error).toBeNull();
  });

  // Still "live" hours later is not the ordinary case, and leaving it silent forever would
  // recreate this ticket's own premise: a payment nothing is looking at. Its status is still not
  // rewritten - Paystack has not finished with it - but a human gets told.
  it("flags a checkout Paystack still calls live long past the cutoff, without rewriting it", async () => {
    upstream.set("spellcode-ref", answer({ status: "ongoing" }));
    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ leftAlone: 1, died: 0, unrecognised: 0 });
    expect(rows[0].status).toBe("initialized");
    expect(rows[0].reconciliation_error).toMatch(/ongoing/);
  });

  // It happened once already: a payment turned out to be charged on a second Paystack business
  // (ticket 30). The application's view of the world is wrong, so never release anything.
  it("leaves a reference Paystack does not recognise untouched, and flags it", async () => {
    upstream.clear();
    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ unrecognised: 1, died: 0, recorded: 0 });
    expect(rows[0].status).toBe("initialized");
    expect(rows[0].reconciliation_error).toMatch(/not found/i);
  });

  it("treats an upstream status it does not know as unrecognised rather than guessing", async () => {
    upstream.set("spellcode-ref", answer({ status: "reversed" }));
    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ unrecognised: 1, died: 0, recorded: 0 });
    expect(rows[0].status).toBe("initialized");
    expect(rows[0].reconciliation_error).toMatch(/reversed/);
  });

  // A provider that is briefly down has said nothing about the reference. Recording that as
  // "Paystack does not recognise it" would send a human hunting for a second Paystack business
  // every time the API has a bad minute.
  it("does not confuse a Paystack outage with an unrecognised reference", async () => {
    upstream.set("spellcode-ref", { status: 503, body: { status: false, message: "Service unavailable" } });
    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ failed: 1, unrecognised: 0, died: 0 });
    expect(rows[0].status).toBe("initialized");
  });

  it("carries on through one payment's failure and still reports the rest", async () => {
    rows = [paymentRow({ id: "payment-1", paystack_reference: "broken" }), paymentRow({ id: "payment-2", paystack_reference: "good" })];
    upstream = new Map([["broken", { status: 503, body: { status: false, message: "down" } }], ["good", answer()]]);
    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ examined: 2, failed: 1, recorded: 1 });
    expect(rows[1].status).toBe("success");
  });

  // Ticket 33 provides this; the criterion is to prove it still holds through the sweep. Two
  // overlapping runs both see an unfinished payment, and only the conditional write stops the
  // second from advancing the installment again.
  it("cannot double-advance an installment when two runs overlap", async () => {
    await Promise.all([reconcileUnfinishedPayments(), reconcileUnfinishedPayments()]);
    expect(rows[0].status).toBe("success");
    expect(subscriptionWrites).toHaveLength(1);
  });

  // A stale read: the candidate query answers the row as it was, the write meets it as it now
  // is. Without the condition on the write, a payment that succeeded between the two would be
  // marked abandoned afterwards - money taken and access then written off.
  it("does not mark a death on a payment that was settled while the run was deciding", async () => {
    rows = [paymentRow({ status: "success" })];
    staleCandidates = [paymentRow({ status: "initialized" })];
    upstream.set("spellcode-ref", answer({ status: "abandoned" }));

    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ examined: 1, died: 0, leftAlone: 1 });

    expect(rows[0].status).toBe("success");
  });

  // PostgREST answers a PATCH with 204 unless asked for the rows, and the Supabase helper turns
  // that into `undefined`. Ticket 33 was bitten by reading it as "nothing matched"; here it
  // would report every death as a live checkout, so it has to be loud instead.
  it("refuses to treat an unanswered death as a checkout still running", async () => {
    upstream.set("spellcode-ref", answer({ status: "abandoned" }));
    const honest = supabaseRequest.getMockImplementation()!;
    supabaseRequest.mockImplementation(async (path: string, init?: { method?: string; body?: string; headers?: HeadersInit }) => {
      if (path.includes("payment_transactions?id") && init?.method === "PATCH" && JSON.parse(init.body ?? "{}").status === "abandoned") return undefined;
      return honest(path, init);
    });

    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ failed: 1, died: 0, leftAlone: 0 });

    expect(rows[0].reconciliation_error).toContain("without asking for the affected rows");
  });

  it("clears a stale flag when the payment is finally recorded", async () => {
    rows = [paymentRow({ reconciliation_error: "flagged on an earlier run" })];
    await reconcileUnfinishedPayments();
    expect(rows[0].status).toBe("success");
    expect(rows[0].reconciliation_error).toBeNull();
  });

  // A payment with nothing wrong with it must not pay for the clearing of a flag it never had.
  it("does not write to a payment it recorded cleanly", async () => {
    await reconcileUnfinishedPayments();
    const flagWrites = supabaseRequest.mock.calls.filter(([, init]: [string, { body?: string }?]) => init?.body?.includes("reconciliation_error"));
    expect(flagWrites).toHaveLength(0);
  });

  // The shared write path must not name this column. If it did, a database that had not run the
  // migration would fail the webhook and the browser return leg as well as the sweep - one
  // unrun migration stopping every payment in the system from granting anything.
  it("settles the payment without the shared write path naming the flag column", async () => {
    rows = [paymentRow({ reconciliation_error: "flagged on an earlier run" })];
    await reconcileUnfinishedPayments();
    const settlement = supabaseRequest.mock.calls.find(([, init]: [string, { method?: string; body?: string }?]) => init?.method === "PATCH" && init.body?.includes('"status":"success"'));
    expect(settlement).toBeDefined();
    expect(settlement![1].body).not.toContain("reconciliation_error");
  });

  // A written-off payment is resolved, so an earlier run's flag on it is stale. Leaving it would
  // put a payment nobody can help back in front of a human on every future query.
  it("clears a stale flag when the payment is written off", async () => {
    rows = [paymentRow({ reconciliation_error: "flagged by an earlier run" })];
    upstream.set("spellcode-ref", answer({ status: "abandoned" }));

    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ died: 1 });

    expect(rows[0].status).toBe("abandoned");
    expect(rows[0].reconciliation_error).toBeNull();
  });

  // The column is a text field a human reads, not a place to put a provider's whole complaint.
  it("truncates what it writes into the flag", async () => {
    upstream.set("spellcode-ref", { status: 503, body: { status: false, message: "x".repeat(900) } });

    await reconcileUnfinishedPayments();

    expect(rows[0].reconciliation_error).toHaveLength(500);
  });

  // "Written in a way that a failure to record the failure cannot fail the run." The other
  // payments in the batch are still worth resolving, and one unwritable row must not stop them.
  it("survives being unable to record a failure", async () => {
    upstream.set("spellcode-ref", { status: 503, body: { status: false, message: "down" } });
    const honest = supabaseRequest.getMockImplementation()!;
    supabaseRequest.mockImplementation(async (path: string, init?: { method?: string; body?: string; headers?: HeadersInit }) => {
      if (init?.body?.includes('"reconciliation_error":"')) throw new Error("the flag column is unwritable");
      return honest(path, init);
    });

    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ examined: 1, failed: 1 });
  });

  // Two overlapping runs, one flagging a transient failure while the other settles the same
  // payment. Without a condition on the flag write the late flag lands on a `success` row and
  // stays there forever, because no run ever looks at a settled payment again.
  it("cannot strand a flag on a payment that has already settled", async () => {
    rows = [paymentRow({ status: "success" })];
    staleCandidates = [paymentRow({ status: "initialized" })];
    upstream.set("spellcode-ref", { status: 503, body: { status: false, message: "down" } });

    await expect(reconcileUnfinishedPayments()).resolves.toMatchObject({ failed: 1 });

    expect(rows[0].reconciliation_error).toBeNull();
  });
});

describe("the scheduled reconciliation endpoint", () => {
  let app: express.Express;

  beforeEach(() => {
    ENV.scheduledTasksSecret = "cron-secret";
    supabaseRequest.mockReset();
    supabaseRequest.mockResolvedValue([]);
    // These tests reach the endpoint over a real socket, so the real `fetch` has to be back:
    // the sweep describe above replaces it to stand in for Paystack. Nothing here reaches
    // Paystack anyway, because a run with no candidates asks it nothing.
    vi.unstubAllGlobals();
    app = express();
    app.use(express.json());
    registerReconciliationEndpoint(app);
  });

  async function callEndpoint(headers: Record<string, string> = {}) {
    const server = await new Promise<ReturnType<express.Express["listen"]>>(resolve => { const instance = app.listen(0, () => resolve(instance)); });
    const address = server.address(); const port = typeof address === "object" && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/api/scheduled/reconcile-payments`, { method: "POST", headers });
    const payload = await response.json().catch(() => null);
    await new Promise<void>(resolve => server.close(() => resolve()));
    return { status: response.status, payload };
  }

  it("runs the sweep and answers with what the run did", async () => {
    // A caller has to be able to see an empty or failed run; a 200 with no body would make a
    // sweep that swept nothing indistinguishable from one that was never triggered.
    await expect(callEndpoint({ "x-spellcode-scheduled-secret": "cron-secret" })).resolves.toMatchObject({ status: 200, payload: { examined: 0, recorded: 0 } });
  });

  it("refuses a request carrying no secret", async () => {
    await expect(callEndpoint()).resolves.toMatchObject({ status: 401 });
  });

  it("refuses a request carrying the wrong secret", async () => {
    await expect(callEndpoint({ "x-spellcode-scheduled-secret": "guessed" })).resolves.toMatchObject({ status: 401 });
    await expect(callEndpoint({ "x-spellcode-scheduled-secret": "cron-secret-with-a-tail" })).resolves.toMatchObject({ status: 401 });
    // A strict prefix, which is the one a sloppy comparison lets through. `startsWith` passes
    // every other case in this file, so without this the guard could be rewritten into
    // something that accepts "c" and no test would notice.
    await expect(callEndpoint({ "x-spellcode-scheduled-secret": "cron-sec" })).resolves.toMatchObject({ status: 401 });
    await expect(callEndpoint({ "x-spellcode-scheduled-secret": "c" })).resolves.toMatchObject({ status: 401 });
  });

  // An unset variable must never mean an open door. This endpoint moves money into Learners'
  // accounts, and a deploy that forgot the secret would otherwise expose it to anyone.
  it("refuses every request when no secret is configured, including one with no header", async () => {
    ENV.scheduledTasksSecret = "";
    await expect(callEndpoint({ "x-spellcode-scheduled-secret": "cron-secret" })).resolves.toMatchObject({ status: 503 });
    await expect(callEndpoint()).resolves.toMatchObject({ status: 503 });
    expect(supabaseRequest).not.toHaveBeenCalled();
  });
});
