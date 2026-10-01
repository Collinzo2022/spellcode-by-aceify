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
 *
 * A payment row carries what the resume path needs, because a row that a test stages
 * without a `provider_payload` is a real row shape too - everything written before
 * ticket 36, and everything `findOrCreateRecurringPayment` writes.
 */
type StubbedPayment = { status: string; created_at: string; id?: string; paystack_reference?: string; provider_payload?: unknown };
type StubbedRows = { subscriptions: Array<{ status: string }>; payments: StubbedPayment[] };

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
        // The resume path reads the row's payload, so the query has to ask for it. Without
        // this the stub would answer a column production had stopped selecting, and every
        // resume test below would pass against a guard that could only ever throw.
        if (!/select=[^&]*provider_payload/.test(path)) throw new Error(`the in-progress guard did not select provider_payload: ${path}`);
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

  /**
   * A live attempt as the guard finds it: the row `initializeCheckout` wrote minutes ago,
   * carrying the payload that makes it resumable. Overridable rather than fixed because
   * the interesting cases are all one field away from it.
   */
  const liveAttempt = (overrides: Partial<StubbedPayment> = {}): StubbedPayment => ({
    id: "payment-earlier",
    paystack_reference: "spellcode-earlier",
    status: "initialized",
    created_at: aged(5 * 60 * 1000),
    provider_payload: { access_code: "earlier-access-code", authorization_url: "https://checkout.paystack.com/earlier-access-code", plan_code: TEST_INSTALLMENT_PLAN.code },
    ...overrides,
  });

  // The fix for ticket 36. Waiting out the cutoff and starting over are both worse than
  // the attempt the Learner already has, which is still payable on Paystack's side, so
  // the guard hands it back instead of refusing. The client redirects on the success
  // path exactly as it does for a new checkout, so the Learner sees no error at all.
  it("hands back the checkout a Learner already started rather than refusing them", async () => {
    rows.payments = [liveAttempt()];

    await expect(initializeCheckout(checkout)).resolves.toEqual({
      authorizationUrl: "https://checkout.paystack.com/earlier-access-code",
      reference: "spellcode-earlier",
      paymentId: "payment-earlier",
    });
  });

  // Two attempts for one intention is the shape of every double-charge in this effort's
  // history. Resuming must reuse the reference, not mint a second one beside it.
  it("starts no second attempt when it resumes the first", async () => {
    rows.payments = [liveAttempt()];
    await initializeCheckout(checkout);

    expect(fetch).not.toHaveBeenCalled();
    expect(writesTo("payment_transactions")).toHaveLength(0);
  });

  // The field the resume path reads, written at the only moment Paystack ever says it. A
  // checkout that did not persist it is an Attempt nobody can reopen, which is the defect.
  it("persists the checkout URL Paystack returned, so the Attempt can be reopened", async () => {
    await initializeCheckout(checkout);

    const [[, init]] = writesTo("payment_transactions") as Array<[string, { body: string }]>;
    expect(JSON.parse(init.body).provider_payload).toMatchObject({ authorization_url: "https://checkout.paystack.com/abc" });
  });

  // Only the URL Paystack returned, never one rebuilt from the `access_code` beside it:
  // Paystack documents that form by example rather than by rule, and an Attempt old enough
  // to lack the stored URL is old enough to have expired.
  it("resumes only at the URL Paystack returned, not one rebuilt from the access code", async () => {
    rows.payments = [liveAttempt({ provider_payload: { access_code: "earlier-access-code" } })];

    await expect(initializeCheckout(checkout)).rejects.toThrow(/didn't finish/);
  });

  // The URL is assigned to `window.location.href`, so a payload is not a place to take a
  // redirect target from on trust. `provider_payload` is written by the webhook too, from
  // a body Paystack posts, and a stored URL that is not Paystack's checkout is not one.
  it("refuses to resume at a URL outside Paystack's checkout", async () => {
    rows.payments = [liveAttempt({ provider_payload: { authorization_url: "https://evil.example/pay" } })];

    await expect(initializeCheckout(checkout)).rejects.toThrow(/didn't finish/);
  });

  it("refuses a Learner whose live Attempt cannot be reopened, distinguishably from one who already has access", async () => {
    // Nowhere to resume to: every row written before ticket 36, and every row
    // `findOrCreateRecurringPayment` writes from a webhook body.
    rows.payments = [liveAttempt({ provider_payload: { plan_code: TEST_INSTALLMENT_PLAN.code } })];
    await expect(initializeCheckout(checkout)).rejects.toThrow(/didn't finish/);

    rows = { subscriptions: [{ status: "active" }], payments: [] };
    // Two questions, two answers. One message for both is what hid the lockout: a Learner
    // barred by a dead row was told they already had access they did not have.
    await expect(initializeCheckout(checkout)).rejects.toThrow("You already have access through this plan.");
  });

  // The old message stated a fact with no horizon in it, so a Learner had nothing to act on
  // and no way to tell a two-hour wait from a permanent refusal. The server holds
  // `created_at`, so the remaining time is computable rather than a guess.
  it("tells a Learner who cannot resume when they can start again", async () => {
    rows.payments = [liveAttempt({ created_at: aged(ABANDONED_CHECKOUT_CUTOFF_MS - 25 * 60 * 1000), provider_payload: null })];

    await expect(initializeCheckout(checkout)).rejects.toThrow("You can start again in about 25 minutes");
  });

  it("counts the horizon down as the attempt ages", async () => {
    rows.payments = [liveAttempt({ created_at: aged(10 * 60 * 1000), provider_payload: null })];

    await expect(initializeCheckout(checkout)).rejects.toThrow("You can start again in about 2 hours");
  });

  // Both boundary tests read the exported cutoff rather than restating two hours, because
  // the point of the constant is that this guard and ticket 35's sweep cannot drift apart. A
  // test carrying its own 7200000 would keep passing after one of them moved.
  // A resumable row makes this boundary sharper than it was: past the cutoff the attempt is
  // not resumed either, it is replaced. A fresh reference is the whole difference.
  it("starts a fresh checkout once an abandoned attempt is past the cutoff, rather than resuming it", async () => {
    rows.payments = [liveAttempt({ created_at: aged(ABANDONED_CHECKOUT_CUTOFF_MS + 60 * 1000) })];
    await expect(initializeCheckout(checkout)).resolves.toMatchObject({ reference: "spellcode-ref", authorizationUrl: "https://checkout.paystack.com/abc" });
  });

  it("still treats an attempt only just inside the cutoff as the live one", async () => {
    rows.payments = [liveAttempt({ created_at: aged(ABANDONED_CHECKOUT_CUTOFF_MS - 60 * 1000) })];
    await expect(initializeCheckout(checkout)).resolves.toMatchObject({ reference: "spellcode-earlier" });
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
