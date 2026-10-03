import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { supabaseAdminRequest } from "./supabase";

type Plan = { id: string; code: string; name: string; currency: string; amount_minor: number; interval: "one_time" | "monthly"; max_installments: number | null; paystack_plan_code: string | null; is_active: boolean };
export type PaymentRecord = { id: string; user_id: string; plan_id: string | null; paystack_reference: string; amount_minor: number; currency: string; status: string };

/** One transaction as Paystack reports it, named once because three call sites read it. */
export type PaystackTransaction = { id: number; status: string; amount: number; currency: string; paid_at: string | null; authorization?: { authorization_code?: string }; customer?: { customer_code?: string }; plan?: { plan_code?: string } | null };

/** Every column the shared write path and the sweep need from a payment row. */
export const PAYMENT_SELECT = "id,user_id,plan_id,paystack_reference,amount_minor,currency,status";

function paystackHeaders() {
  if (!ENV.paystackSecretKey) throw new Error("Paystack secret key is not configured");
  return { Authorization: `Bearer ${ENV.paystackSecretKey}`, "Content-Type": "application/json" };
}

export function isValidPaystackSignature(raw: Buffer, received: string, secret: string) {
  const expected = crypto.createHmac("sha512", secret).update(raw).digest("hex");
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return Boolean(received) && receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function paystackLifecycleStatus(event: string, upstreamStatus: string) {
  if (event === "invoice.payment_failed" || upstreamStatus === "attention") return "past_due";
  if (event === "subscription.disable" || upstreamStatus === "complete" || upstreamStatus === "cancelled") return "expired";
  return "active";
}

async function paystackRequest<T>(path: string, init: RequestInit) {
  const response = await fetch(`https://api.paystack.co${path}`, { ...init, headers: { ...paystackHeaders(), ...(init.headers ?? {}) } });
  const payload = await response.json().catch(() => null) as { status?: boolean; message?: string; data?: T } | null;
  if (!response.ok || !payload?.status || !payload.data) throw new Error(payload?.message ?? `Paystack request failed (${response.status})`);
  return payload.data;
}

export function buildPaystackInitializePayload(input: { email: string; reference: string; plan: Plan; callbackUrl: string; userId: string }) {
  const metadata = JSON.stringify({ user_id: input.userId, plan_code: input.plan.code, product: "SpellCode by Aceify Full Access" });
  const payload: Record<string, unknown> = { email: input.email, reference: input.reference, currency: input.plan.currency, callback_url: input.callbackUrl, metadata };
  if (input.plan.interval === "one_time") payload.amount = String(input.plan.amount_minor);
  else { payload.amount = String(input.plan.amount_minor); payload.plan = input.plan.paystack_plan_code; payload.invoice_limit = input.plan.max_installments; }
  return payload;
}

/**
 * How long an unfinished checkout stays alive.
 *
 * One number, read by two things that must agree: this module's in-progress guard,
 * and the reconciliation sweep that declares a dead checkout dead (ticket 35). If
 * the guard held on longer than the sweep, a Learner would be barred by a row
 * nothing was going to clear, which is the lockout ticket 34 removed. Two hours is
 * a judgement - long enough to outlast Paystack's own retries and a Learner who is
 * slow finding their card - not a derivation.
 */
export const ABANDONED_CHECKOUT_CUTOFF_MS = 2 * 60 * 60 * 1000;

/** The oldest creation time at which a checkout still counts as live. */
export function abandonedCheckoutCutoff() {
  return new Date(Date.now() - ABANDONED_CHECKOUT_CUTOFF_MS).toISOString();
}

/**
 * The payment state of a checkout nobody has resolved yet.
 *
 * Narrower than `UNSETTLED_PAYMENT_STATES` on purpose, and the difference is not an
 * oversight. That set answers "could this still become `success`?", which `abandoned`
 * and `failed` can. This one answers "is the Learner mid-payment right now?", which
 * they are not: a declined card is the commonest reason anyone starts over, and
 * refusing them for two hours would be the same lockout wearing a different row.
 */
const CHECKOUT_IN_PROGRESS_STATE = "initialized";

/**
 * Where Paystack hosts a checkout, and the only host a Learner is sent to.
 *
 * `provider_payload` is written from a webhook body as well as from a checkout, so a
 * URL read back out of it is not a URL to redirect to on trust - the client assigns it
 * to `window.location.href`. Anything not under this host is discarded (ticket 36).
 */
const PAYSTACK_CHECKOUT_BASE = "https://checkout.paystack.com/";

/**
 * Where a still-live Checkout Attempt can be reopened, or `null` for a row carrying nowhere.
 *
 * Only the `authorization_url` Paystack itself returned, which `initializeCheckout` persists
 * since ticket 36. Rebuilding the URL from the `access_code` beside it would also work -
 * Paystack's documented example shows the code is the URL's last segment - but an example is
 * not a stated rule, this effort has been bitten three times by a provider detail inferred
 * rather than read (tickets 28, 30, 32), and the only rows that would need the inference are
 * ones written before the field was persisted, all of which have since expired.
 *
 * Two shapes reach this column and only one of them is an Attempt: `findOrCreateRecurringPayment`
 * writes a raw webhook body at `initialized` too. A `charge.success` body carries no
 * `authorization_url`, so it answers `null` and the caller falls back to telling the Learner
 * to wait - and the host check means that even a body that did carry one could only ever send
 * them to Paystack's own checkout.
 */
function resumableCheckoutUrl(providerPayload: unknown) {
  const stored = (providerPayload as { authorization_url?: unknown } | null)?.authorization_url;
  return typeof stored === "string" && stored.startsWith(PAYSTACK_CHECKOUT_BASE) ? stored : null;
}

/**
 * What to tell a Learner whose Attempt is still live and cannot be reopened.
 *
 * The message this replaced stated a fact - a payment is in progress - that named no
 * horizon, so a two-hour wait was indistinguishable from a permanent refusal, and the
 * Learner's only move was to press the button again (ticket 36). The server holds
 * `created_at`, so the wait is computed rather than guessed. A `created_at` that does not
 * parse falls back to the whole cutoff: overstating the wait is survivable, and a message
 * reading "in about NaN minutes" is not.
 */
function unresumableAttemptMessage(createdAt: string) {
  const expiresAt = new Date(createdAt).getTime() + ABANDONED_CHECKOUT_CUTOFF_MS;
  const remainingMs = Number.isFinite(expiresAt) ? expiresAt - Date.now() : ABANDONED_CHECKOUT_CUTOFF_MS;
  const minutes = Math.ceil(remainingMs / 60_000);
  const horizon = minutes <= 1 ? "in about a minute" : minutes < 90 ? `in about ${minutes} minutes` : `in about ${Math.round(minutes / 60)} hours`;
  return `You started paying for this plan and didn't finish, and that attempt cannot be reopened from here. You can start again ${horizon}.`;
}

export async function initializeCheckout(input: { userId: string; email: string; planCode: string; callbackUrl: string }) {
  const plans = await supabaseAdminRequest<Plan[]>(`/rest/v1/plans?code=eq.${encodeURIComponent(input.planCode)}&select=id,code,name,currency,amount_minor,interval,max_installments,paystack_plan_code,is_active`);
  const plan = plans[0];
  if (!plan?.is_active) throw new Error("This access plan is not available right now.");
  if (plan.interval !== "one_time" && !plan.paystack_plan_code) throw new Error("This installment plan is not configured yet.");
  if (!input.email) throw new Error("A verified email address is required to start payment.");
  // One check used to answer both "do you already have access?" and "have you already
  // started paying?", by reading a `pending` Subscription this function no longer writes.
  // They are two questions against two tables, and they get two answers: a Learner refused
  // because an attempt is in flight is not a Learner who has what they are trying to buy.
  const existingAccess = await supabaseAdminRequest<Array<{ status: string }>>(`/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(input.userId)}&plan_id=eq.${plan.id}&status=in.(active,past_due)&select=status&limit=1`);
  if (existingAccess.length > 0) throw new Error("You already have access through this plan.");
  // Bounded by age, so an attempt nothing ever swept stops blocking on its own. A sleeping
  // server must not be able to lock anyone out of a plan permanently.
  const inProgress = await supabaseAdminRequest<Array<{ id: string; paystack_reference: string; created_at: string; provider_payload: unknown }>>(`/rest/v1/payment_transactions?user_id=eq.${encodeURIComponent(input.userId)}&plan_id=eq.${plan.id}&status=eq.${CHECKOUT_IN_PROGRESS_STATE}&created_at=gte.${encodeURIComponent(abandonedCheckoutCutoff())}&select=id,paystack_reference,created_at,provider_payload&limit=1`);
  const attempt = inProgress[0];
  if (attempt) {
    // The Attempt is still payable on Paystack's side, so handing it back beats both of the
    // alternatives this used to leave: waiting out the cutoff, or being refused with nothing
    // to do about it. The caller redirects on this path exactly as it does for a new
    // checkout, so a Learner who returns sees their own payment page rather than an error.
    const authorizationUrl = resumableCheckoutUrl(attempt.provider_payload);
    if (authorizationUrl) return { authorizationUrl, reference: attempt.paystack_reference, paymentId: attempt.id };
    throw new Error(unresumableAttemptMessage(attempt.created_at));
  }
  const reference = `spellcode-${crypto.randomUUID()}`;
  const result = await paystackRequest<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", { method: "POST", body: JSON.stringify(buildPaystackInitializePayload({ email: input.email, reference, plan, callbackUrl: input.callbackUrl, userId: input.userId })) });
  const [payment] = await supabaseAdminRequest<PaymentRecord[]>("/rest/v1/payment_transactions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: input.userId, plan_id: plan.id, paystack_reference: result.reference, amount_minor: plan.amount_minor, currency: plan.currency, status: "initialized", provider_payload: { access_code: result.access_code, authorization_url: result.authorization_url, plan_code: plan.code } }) });
  // No Subscription is written here. A Learner who is looking at the Paystack page holds
  // nothing, and a row claiming otherwise is what barred them from ever buying the plan.
  // `recordVerifiedPayment` creates it when the money arrives - see ADR 0005.
  return { authorizationUrl: result.authorization_url, reference: result.reference, paymentId: payment.id };
}

function parseMetadata(metadata: unknown) { try { return typeof metadata === "string" ? JSON.parse(metadata) : metadata as Record<string, unknown>; } catch { return {}; } }

/**
 * Ask Paystack about one reference, telling "Paystack does not know this" apart from
 * "Paystack could not be asked".
 *
 * `paystackRequest` collapses both into a throw, which is right for a checkout - the
 * Learner simply tries again - and wrong for the sweep. A reference that does not exist
 * on this integration means the application's view of the world is wrong, which happened
 * once already when a payment turned out to be charged on a second Paystack business
 * (ticket 30), and a human has to look at it. A provider that is briefly unreachable is
 * nothing to act on and must not be recorded as an unrecognised reference.
 */
async function fetchPaystackTransaction(reference: string): Promise<{ known: true; transaction: PaystackTransaction } | { known: false; message: string }> {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: paystackHeaders() });
  const payload = await response.json().catch(() => null) as { status?: boolean; message?: string; data?: PaystackTransaction } | null;
  // A refusal Paystack means: 404, or any other client-side answer that says `status: false`.
  // A 5xx is the provider failing, not an answer about the reference, so it throws below.
  if (response.status === 404 || (response.status < 500 && payload?.status === false)) return { known: false, message: payload?.message ?? `Paystack does not recognise ${reference}` };
  if (!response.ok || !payload?.status || !payload.data) throw new Error(payload?.message ?? `Paystack verification failed (${response.status})`);
  return { known: true, transaction: payload.data };
}

/**
 * What asking Paystack about one payment established, and what was done about it.
 *
 * The four cases are the sweep's four rows in ticket 35, and they are deliberately not
 * collapsed into a boolean: "Paystack took different money than we asked for" and
 * "Paystack has never heard of this reference" both mean *do not grant*, but only one of
 * them means a Learner is waiting, and only a human can tell them apart.
 */
export type PaymentVerification =
  | { kind: "settled"; settlement: PaymentSettlement }
  | { kind: "mismatched"; detail: string }
  | { kind: "unpaid"; upstreamStatus: string }
  | { kind: "unrecognised"; detail: string };

/**
 * Verify one payment record against Paystack and record it if the money is there.
 *
 * Takes a payment row rather than a reference and a Learner, because the sweep has no
 * Learner behind it. Proving that a Learner owns a reference is a browser concern and
 * lives in `verifyCheckout`, which calls this.
 */
export async function verifyPaymentAtPaystack(payment: PaymentRecord): Promise<PaymentVerification> {
  const answer = await fetchPaystackTransaction(payment.paystack_reference);
  if (!answer.known) return { kind: "unrecognised", detail: answer.message };
  const { transaction } = answer;
  if (transaction.status !== "success") return { kind: "unpaid", upstreamStatus: transaction.status };
  // Both halves of the comparison matter. An amount that matches in the wrong currency is a
  // different sum of money, and granting on it is granting on a number nobody checked.
  if (transaction.amount !== payment.amount_minor || transaction.currency !== payment.currency) return { kind: "mismatched", detail: `Paystack settled ${transaction.amount} ${transaction.currency}; this payment expects ${payment.amount_minor} ${payment.currency}` };
  return { kind: "settled", settlement: await recordVerifiedPayment(payment, transaction) };
}

export async function verifyCheckout(reference: string, expectedUserId: string) {
  const payments = await supabaseAdminRequest<PaymentRecord[]>(`/rest/v1/payment_transactions?paystack_reference=eq.${encodeURIComponent(reference)}&select=${PAYMENT_SELECT}`);
  const payment = payments[0];
  if (!payment || payment.user_id !== expectedUserId) throw new Error("Payment transaction not found.");
  const verification = await verifyPaymentAtPaystack(payment);
  // What the write did, not what Paystack said. Since ticket 33 a payment already settled as
  // `refunded` or `disputed` is deliberately not granted, and this used to answer
  // `verified: true` regardless - telling a Learner whose money was unwound that they had
  // access. Nothing reaches that state today, so it was latent rather than live.
  if (verification.kind === "settled") {
    if (verification.settlement === "withheld") throw new Error("This payment was reversed, so it does not grant access. Please contact support.");
    return { verified: true, status: "success" as const };
  }
  throw new Error("Payment has not been verified yet.");
}

/**
 * The payment states that carry no recorded money, so may still become `success`.
 *
 * `refunded` and `disputed` are deliberately absent: money has already been
 * recorded and then unwound, and a late charge event must not quietly restore
 * access. `abandoned` and `failed` are present because a checkout written off is
 * not a checkout that cannot still be paid - a Learner who returns to the same
 * Paystack link settles the same reference, and that charge is owed to them.
 */
export const UNSETTLED_PAYMENT_STATES = ["initialized", "abandoned", "failed"] as const;

/** The states a payment can be moved to by writing off an attempt nobody paid. */
export const DEAD_PAYMENT_STATES = ["abandoned", "failed"] as const;
export type DeadPaymentState = (typeof DEAD_PAYMENT_STATES)[number];

/**
 * Write off an unfinished payment, and say whether that matched anything.
 *
 * Conditional for the mirror of the reason the success transition is: a payment that succeeded
 * between a caller's decision and this write must not be marked abandoned afterwards. The state
 * is typed, so only a value the `payment_state` enum holds can reach the column.
 */
export async function markPaymentDead(paymentId: string, state: DeadPaymentState) {
  return writeIfUnsettled(paymentId, { status: state }, "Payment death");
}

/**
 * Move a payment's row only while it is still unsettled, and say whether that matched anything.
 *
 * Every write that advances a payment goes through here, because each one is a check-then-act:
 * the caller read the row, decided, and by the time it writes another writer may have settled it.
 * The condition travels on the write itself, so a caller whose write matched nothing knows to stop
 * rather than going on to credit a Subscription twice (ticket 33).
 *
 * The `undefined` case is the trap that made ticket 33's first attempt worse than the bug it fixed.
 * PostgREST answers a PATCH with 204 unless asked for the affected rows, and the Supabase helper
 * turns 204 into `undefined`. Reading that as "nothing matched" is indistinguishable from "another
 * writer won", so dropping one header would make every payment look already settled and grant
 * nothing, silently. It throws instead: the webhook records the message and returns 500, so the
 * fault is loud and lands somewhere durable. Owning it in one place is why there is one copy of
 * this reasoning rather than one per caller.
 */
async function writeIfUnsettled(paymentId: string, patch: Record<string, unknown>, failureContext: string) {
  const rows = await supabaseAdminRequest<PaymentRecord[] | undefined>(`/rest/v1/payment_transactions?id=eq.${paymentId}&status=in.(${UNSETTLED_PAYMENT_STATES.join(",")})`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
  if (rows === undefined) throw new Error(`${failureContext} was written without asking for the affected rows`);
  return rows.length > 0;
}

/**
 * What a verified payment did to the Learner's access, as distinct from what was attempted.
 *
 * `withheld` is the case ticket 33 created and left uncovered: the money was recorded once
 * and then unwound, so a late charge event must not restore access. A caller that reports
 * the attempt rather than this tells such a Learner they have what they do not.
 */
export type PaymentSettlement = "granted" | "already-granted" | "withheld";

async function recordVerifiedPayment(payment: PaymentRecord, transaction: PaystackTransaction): Promise<PaymentSettlement> {
  if (payment.status === "success") return "already-granted";
  // This deliberately does not touch `reconciliation_error`, though clearing a stale flag here
  // would be convenient. Naming a column in the shared write path means a database missing it
  // fails the webhook and the browser return leg too, so one unrun migration would stop every
  // payment granting anything. The sweep owns that column and clears its own flags.
  const settled = await writeIfUnsettled(payment.id, { status: "success", paystack_transaction_id: String(transaction.id), paystack_authorization_code: transaction.authorization?.authorization_code ?? null, paid_at: transaction.paid_at ?? new Date().toISOString(), provider_payload: transaction }, "Payment transition");
  // The write matched nothing, so the row moved between the read and it - but "another writer
  // granted this first" and "this money was unwound and must not grant" are opposite answers for
  // the Learner waiting on the reply. One read tells them apart, and it only happens on this
  // branch, so the common path pays nothing for it.
  if (!settled) {
    const current = await supabaseAdminRequest<Array<{ status: string }>>(`/rest/v1/payment_transactions?id=eq.${payment.id}&select=status`);
    return current[0]?.status === "success" ? "already-granted" : "withheld";
  }
  if (payment.plan_id) {
    // `code` is selected because the create below snapshots it. The write this replaced ran at
    // checkout and had the Plan in hand; this one starts from a payment row and has to fetch it.
    const plans = await supabaseAdminRequest<Plan[]>(`/rest/v1/plans?id=eq.${payment.plan_id}&select=id,code,interval,max_installments`);
    const plan = plans[0];
    // Since ticket 34 nothing creates a `pending` Subscription, so this is the path every
    // first payment takes rather than the rare branch it used to be. `pending` stays in the
    // filter only so a row predating that change is credited instead of duplicated; when the
    // state is gone from the database it should go from here too.
    const subscriptions = await supabaseAdminRequest<Array<{ id: string; installments_paid: number; installments_due: number | null }>>(`/rest/v1/subscriptions?user_id=eq.${payment.user_id}&plan_id=eq.${payment.plan_id}&status=in.(pending,active,past_due)&select=id,installments_paid,installments_due&order=created_at.desc&limit=1`);
    const subscription = subscriptions[0];
    const installmentsDue = subscription?.installments_due ?? plan?.max_installments ?? 1;
    const installmentsPaid = Math.min(installmentsDue, (subscription?.installments_paid ?? 0) + 1);
    const patch = { status: "active", paystack_customer_code: transaction.customer?.customer_code ?? null, current_period_start: new Date().toISOString(), installments_paid: installmentsPaid, installments_due: installmentsDue, last_payment_at: transaction.paid_at ?? new Date().toISOString(), updated_at: new Date().toISOString() };
    if (subscription) await supabaseAdminRequest(`/rest/v1/subscriptions?id=eq.${subscription.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    // The snapshot carries the plan code because the checkout write that used to carry it is gone,
    // and this branch is now every Learner's first Subscription. Without it no Subscription would
    // record which Plan it was sold as - a silent loss, since nothing reads the column yet.
    else await supabaseAdminRequest("/rest/v1/subscriptions", { method: "POST", body: JSON.stringify({ user_id: payment.user_id, plan_id: payment.plan_id, ...patch, plan_snapshot: { plan_code: plan?.code ?? null, source: "paystack" } }) });
  }
  return "granted";
}

/**
 * Why a verified Paystack event could not be applied, written where a human will look.
 *
 * Both lookups below resolve a Plan by `paystack_plan_code`, and both used to return early when
 * nothing matched. The event body is stored before any branch runs, which reads like a safety net
 * and is not one: the route patches `processed_at` after the branches, so a dropped event was
 * recorded as handled with `processing_error: null` - the same row a handled event leaves. Throwing
 * puts the reason in `processing_error` instead, leaves `processed_at` unset, and answers non-200 so
 * the drop also shows in Paystack's own webhook log, which is the one place a human can look without
 * database access.
 *
 * The plan code is in the message because it is the whole diagnosis. ADR 0004 keeps
 * `plans.paystack_plan_code` single and patched at cutover, so the live-mode form of this fault is a
 * live `PLN_` arriving against a stored test one; seeing both codes side by side is what names it.
 * ADR 0004 says it "removes the circumstance rather than the failure mode", and an unconfigured plan
 * outlives the cutover.
 *
 * A consequence worth stating: Paystack retries a delivery it could not deliver, and these retries
 * cannot succeed until someone configures the plan. That is the intended trade - a retry that
 * succeeds the moment the column is patched, in exchange for noise that is visible rather than a
 * silence that is not.
 */
function unappliedEventMessage(planCode: string, detail: string) {
  return `Paystack event names plan ${planCode} and was not applied: ${detail}. Nothing was recorded for it - see ticket 32 and ADR 0004.`;
}

/** The lookup that fails on an unconfigured or wrong-mode plan code, named once for both call sites. */
const NO_SUCH_PLAN = "no plans row carries that paystack_plan_code";

export async function findOrCreateRecurringPayment(data: Record<string, unknown>) {
  const reference = String(data.reference ?? "");
  if (!reference) return null;
  const existing = await supabaseAdminRequest<PaymentRecord[]>(`/rest/v1/payment_transactions?paystack_reference=eq.${encodeURIComponent(reference)}&select=id,user_id,plan_id,paystack_reference,amount_minor,currency,status`);
  if (existing[0]) return existing[0];
  const metadata = parseMetadata(data.metadata);
  const customer = data.customer as Record<string, unknown> | undefined;
  const planData = data.plan as Record<string, unknown> | undefined;
  const planCode = String(planData?.plan_code ?? metadata.plan_code ?? "");
  const customerCode = String(customer?.customer_code ?? "");
  const userId = typeof metadata.user_id === "string" ? metadata.user_id : "";
  if (!planCode || (!customerCode && !userId)) return null;
  const plans = await supabaseAdminRequest<Plan[]>(`/rest/v1/plans?paystack_plan_code=eq.${encodeURIComponent(planCode)}&select=id,code,name,currency,amount_minor,interval,max_installments,paystack_plan_code,is_active`);
  const plan = plans[0];
  if (!plan) throw new Error(unappliedEventMessage(planCode, NO_SUCH_PLAN));
  const subscriptionQuery = userId
    ? `/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&plan_id=eq.${plan.id}&status=in.(active,past_due)&select=id,user_id,plan_id&order=updated_at.desc&limit=1`
    : `/rest/v1/subscriptions?paystack_customer_code=eq.${encodeURIComponent(customerCode)}&plan_id=eq.${plan.id}&status=in.(active,past_due)&select=id,user_id,plan_id&order=updated_at.desc&limit=1`;
  const subscriptions = await supabaseAdminRequest<Array<{ id: string; user_id: string; plan_id: string }>>(subscriptionQuery);
  const subscription = subscriptions[0];
  // This one throws where `updateSubscriptionLifecycle`'s matching lookup returns, and the asymmetry
  // is the point. Getting here means a charge arrived whose reference has no payment row, which is a
  // renewal and not a first payment - a Subscription it renews must already exist. Money moved, so a
  // drop here is the failure this ticket is about; there, no money has moved and the miss is routine.
  if (!subscription) throw new Error(unappliedEventMessage(planCode, `plan ${plan.code} matched, but no active or past_due Subscription belongs to ${userId ? `Learner ${userId}` : `customer ${customerCode}`}`));
  const created = await supabaseAdminRequest<PaymentRecord[]>("/rest/v1/payment_transactions?on_conflict=paystack_reference", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ user_id: subscription.user_id, plan_id: subscription.plan_id, subscription_id: subscription.id, paystack_reference: reference, amount_minor: Number(data.amount ?? plan.amount_minor), currency: String(data.currency ?? plan.currency), status: "initialized", provider_payload: data }) });
  return created[0] ?? (await supabaseAdminRequest<PaymentRecord[]>(`/rest/v1/payment_transactions?paystack_reference=eq.${encodeURIComponent(reference)}&select=id,user_id,plan_id,paystack_reference,amount_minor,currency,status`))[0] ?? null;
}

async function updateSubscriptionLifecycle(input: { event: string; data: Record<string, unknown> }) {
  const subscriptionData = (input.data.subscription ?? input.data) as Record<string, unknown>;
  const customer = input.data.customer as Record<string, unknown> | undefined;
  const planData = (subscriptionData.plan ?? input.data.plan) as Record<string, unknown> | undefined;
  const customerCode = String(customer?.customer_code ?? subscriptionData.customer_code ?? "");
  const planCode = String(planData?.plan_code ?? input.data.plan_code ?? "");
  if (!customerCode || !planCode) return;
  const plans = await supabaseAdminRequest<Plan[]>(`/rest/v1/plans?paystack_plan_code=eq.${encodeURIComponent(planCode)}&select=id,code,interval,max_installments`);
  const plan = plans[0];
  if (!plan) throw new Error(unappliedEventMessage(planCode, `${NO_SUCH_PLAN}, so ${input.event} changed nothing`));
  const subscriptions = await supabaseAdminRequest<Array<{ id: string; installments_paid: number; installments_due: number | null }>>(`/rest/v1/subscriptions?plan_id=eq.${plan.id}&paystack_customer_code=eq.${encodeURIComponent(customerCode)}&select=id,installments_paid,installments_due&order=updated_at.desc&limit=1`);
  const subscription = subscriptions[0];
  // Deliberately NOT a throw, unlike the plan lookup above. Since ticket 34 a checkout writes no
  // Subscription - `recordVerifiedPayment` does, on `charge.success` - so a `subscription.create`
  // that outruns the charge finds nothing here, and that is the ordinary first-installment
  // interleaving rather than a fault. Throwing would 500 on normal traffic. Nothing is lost by
  // returning: these events carry no money, and the charge that does carries its own branch.
  if (!subscription) return;
  const upstreamStatus = String(subscriptionData.status ?? "");
  const status = paystackLifecycleStatus(input.event, upstreamStatus);
  await supabaseAdminRequest(`/rest/v1/subscriptions?id=eq.${subscription.id}`, { method: "PATCH", body: JSON.stringify({ status, paystack_subscription_code: String(subscriptionData.subscription_code ?? "") || null, paystack_email_token: String(subscriptionData.email_token ?? "") || null, cancel_at_period_end: input.event === "subscription.not_renew" || upstreamStatus === "non-renewing", current_period_end: subscriptionData.next_payment_date ?? null, updated_at: new Date().toISOString() }) });
}

export function registerPaystackWebhook(app: Express) {
  app.post("/api/paystack/webhook", async (req: Request & { rawBody?: Buffer }, res: Response) => {
    // Paystack signs the bytes it sent, so only the bytes it sent can be verified. Without them
    // the request is unverifiable and is refused rather than checked against a re-serialisation.
    const raw = req.rawBody;
    const received = req.header("x-paystack-signature") ?? "";
    if (!raw || !isValidPaystackSignature(raw, received, ENV.paystackSecretKey)) return res.status(401).json({ error: "Invalid Paystack signature" });
    const event = req.body as { event?: string; data?: Record<string, unknown> };
    const eventId = crypto.createHash("sha256").update(raw).digest("hex");
    try {
      await supabaseAdminRequest("/rest/v1/paystack_webhook_events?on_conflict=event_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ event_id: eventId, event_type: event.event ?? "unknown", payload: event }) });
      if (event.event === "charge.success") {
        const reference = String(event.data?.reference ?? "");
        const payments = await supabaseAdminRequest<PaymentRecord[]>(`/rest/v1/payment_transactions?paystack_reference=eq.${encodeURIComponent(reference)}&select=id,user_id,plan_id,paystack_reference,amount_minor,currency,status`);
        const payment = payments[0] ?? await findOrCreateRecurringPayment(event.data ?? {});
        if (payment) await recordVerifiedPayment(payment, { id: Number(event.data?.id ?? 0), status: "success", amount: Number(event.data?.amount ?? 0), currency: String(event.data?.currency ?? "NGN"), paid_at: String(event.data?.paid_at ?? new Date().toISOString()), authorization: event.data?.authorization as { authorization_code?: string }, customer: event.data?.customer as { customer_code?: string }, plan: event.data?.plan as { plan_code?: string } });
      }
      if (["subscription.create", "subscription.disable", "subscription.not_renew", "invoice.payment_failed", "invoice.update"].includes(event.event ?? "")) await updateSubscriptionLifecycle({ event: event.event ?? "", data: event.data ?? {} });
      // `processing_error` is cleared, not just left: a retry of an event that failed earlier - the
      // self-healing case, once an operator patches the plan code - would otherwise carry both
      // columns at once and be ambiguous to exactly the person this record exists for.
      await supabaseAdminRequest(`/rest/v1/paystack_webhook_events?event_id=eq.${eventId}`, { method: "PATCH", body: JSON.stringify({ processed_at: new Date().toISOString(), processing_error: null }) });
      return res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      await supabaseAdminRequest(`/rest/v1/paystack_webhook_events?event_id=eq.${eventId}`, { method: "PATCH", body: JSON.stringify({ processing_error: message.slice(0, 500) }) }).catch(() => undefined);
      return res.status(500).json({ error: message });
    }
  });
}
