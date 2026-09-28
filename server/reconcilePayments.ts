import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { abandonedCheckoutCutoff, DEAD_PAYMENT_STATES, markPaymentDead, PAYMENT_SELECT, UNSETTLED_PAYMENT_STATES, verifyPaymentAtPaystack, type DeadPaymentState, type PaymentRecord } from "./paystack";
import { supabaseAdminRequest } from "./supabase";

type UnfinishedPayment = PaymentRecord & { created_at: string; reconciliation_error: string | null };

/**
 * How many payments one run will look at.
 *
 * A run has to finish well inside the schedule, and each payment costs one Paystack
 * request. There is nothing to sweep on day one, so this is a ceiling against a backlog
 * nobody has yet rather than a tuned number; the oldest are taken first, so a backlog
 * larger than this drains across runs instead of starving.
 */
const RECONCILIATION_BATCH = 100;

/**
 * Upstream states that mean Paystack has not finished with the checkout.
 *
 * Left alone and **not** flagged. They are the normal states of a Learner who is still
 * on the payment page, and flagging them would put every live checkout in front of a
 * human every ten minutes.
 */
const LIVE_UPSTREAM_STATES = ["ongoing", "pending", "processing", "queued"] as const;

const isLiveUpstream = (status: string) => (LIVE_UPSTREAM_STATES as readonly string[]).includes(status);

/**
 * Whether Paystack's word for this attempt is one the payment's own status can carry.
 *
 * `DEAD_PAYMENT_STATES` is the application's vocabulary, and Paystack happens to use the same
 * two words. Mapped straight through rather than flattened into one: "nobody completed the
 * checkout" and "the card was declined" are different facts, and only one describes a Learner
 * worth helping. Narrowing here is what keeps a status Paystack invented out of the enum column.
 */
const isDeadUpstream = (status: string): status is DeadPaymentState => (DEAD_PAYMENT_STATES as readonly string[]).includes(status);

/** What one run did, so a caller can see an empty or failing run rather than just a 200. */
export type ReconciliationSummary = {
  examined: number;
  recorded: number;
  mismatched: number;
  died: number;
  leftAlone: number;
  unrecognised: number;
  failed: number;
};

/**
 * Record a failure on the payment itself, where a restart cannot lose it.
 *
 * There is no alerting in this project and the host keeps logs briefly, which is the same
 * invisibility that let a paid ₦120,000 sit unnoticed for seven hours on 2026-09-25. One
 * query over this column finds every payment needing a human.
 *
 * A failure to record the failure must not fail the run: the other payments in the batch
 * are still worth resolving, and the alternative is one bad row stopping the sweep.
 */
async function flagForHuman(paymentId: string, message: string) {
  // Conditional, for the same reason every other write here is. Two overlapping runs can have
  // one flagging a transient failure while the other settles the same payment; without this
  // filter the late flag lands on a `success` row and stays there forever, because no run ever
  // looks at a settled payment again. That would make "a non-null value means a payment still
  // needing attention" false, which is the whole value of the column.
  //
  // `neq.success` rather than the unsettled set, because a payment sitting in `refunded` or
  // `disputed` is exactly the kind a human should see.
  await supabaseAdminRequest(`/rest/v1/payment_transactions?id=eq.${paymentId}&status=neq.success`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ reconciliation_error: message.slice(0, 500), updated_at: new Date().toISOString() }) }).catch(() => undefined);
}

/**
 * Drop a flag a previous run left, now that the payment has settled.
 *
 * Only called when the candidate row actually carried one, so a healthy payment costs no
 * extra write. Deliberately *not* folded into the shared write path: doing that would make
 * `recordVerifiedPayment` name this column on every settlement, and a database missing the
 * column would then fail the webhook and the browser return leg as well as the sweep - one
 * unrun migration turning into every payment failing. Keeping it here means an unrun
 * migration costs only the sweep.
 */
async function clearFlag(paymentId: string) {
  await supabaseAdminRequest(`/rest/v1/payment_transactions?id=eq.${paymentId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ reconciliation_error: null }) }).catch(() => undefined);
}

/**
 * Resolve every unfinished payment, without anyone watching.
 *
 * Two things move a payment off `initialized` otherwise - the webhook, and one attempt on
 * the browser return leg - and **both failed independently on 2026-09-25**, with nothing
 * else looking. Neither is server-initiated. This is the one that is.
 *
 * The two cutoffs are deliberately not one cutoff. A success is swept at any age, because a
 * paid Learner is waiting and asking early costs one request. A death waits for the shared
 * abandoned cutoff, because it has to outlast Paystack's own retries and a Learner who is
 * slow with their card. Sweeping deaths as eagerly as successes kills live checkouts.
 */
export async function reconcileUnfinishedPayments(): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = { examined: 0, recorded: 0, mismatched: 0, died: 0, leftAlone: 0, unrecognised: 0, failed: 0 };
  // Every unfinished state, not `initialized` alone: a checkout written off as abandoned can
  // still be settled by a Learner returning to the same Paystack link, and filtering it out
  // here would make the path ticket 33 deliberately preserved unreachable from the sweep.
  const candidates = await supabaseAdminRequest<UnfinishedPayment[]>(`/rest/v1/payment_transactions?status=in.(${UNSETTLED_PAYMENT_STATES.join(",")})&select=${PAYMENT_SELECT},created_at,reconciliation_error&order=created_at.asc&limit=${RECONCILIATION_BATCH}`);
  const deadCutoff = abandonedCheckoutCutoff();
  for (const payment of candidates) {
    summary.examined += 1;
    try {
      const verification = await verifyPaymentAtPaystack(payment);
      if (verification.kind === "settled") {
        // `withheld` cannot arise from this query, whose candidates carry no recorded money.
        // If it ever does, the row disagrees with the filter that selected it, and that is a
        // human's problem rather than something to grant on.
        if (verification.settlement === "withheld") { summary.mismatched += 1; await flagForHuman(payment.id, "Paystack reports this payment as successful, but its recorded state refuses to grant access."); continue; }
        summary.recorded += 1;
        if (payment.reconciliation_error) await clearFlag(payment.id);
        continue;
      }
      if (verification.kind === "mismatched") { summary.mismatched += 1; await flagForHuman(payment.id, verification.detail); continue; }
      if (verification.kind === "unrecognised") { summary.unrecognised += 1; await flagForHuman(payment.id, verification.detail); continue; }
      if (isLiveUpstream(verification.upstreamStatus)) {
        summary.leftAlone += 1;
        // A live state is the ordinary condition of a Learner still on the payment page, so it is
        // not flagged - and its status is never rewritten, because Paystack has not finished with
        // it. But "live" past the cutoff is not ordinary, and leaving it silent forever would
        // recreate this ticket's own premise: a payment nothing is looking at.
        if (payment.created_at < deadCutoff) await flagForHuman(payment.id, `Paystack still reports this payment as ${verification.upstreamStatus} well past the abandoned cutoff.`);
        continue;
      }
      if (!isDeadUpstream(verification.upstreamStatus)) {
        // A status this application has no word for. Never guess: a reversal read as a death
        // would write off money that moved.
        summary.unrecognised += 1;
        await flagForHuman(payment.id, `Paystack reports an unrecognised status for this payment: ${verification.upstreamStatus}`);
        continue;
      }
      if (payment.created_at >= deadCutoff) { summary.leftAlone += 1; continue; }
      // A write that matched nothing did not kill anything: the row was settled between this
      // run's verification and its write, and reporting it as a death would be a lie in the
      // one place a human looks to see what the run did.
      if (await markPaymentDead(payment.id, verification.upstreamStatus)) {
        summary.died += 1;
        // A written-off payment is resolved, so an earlier run's flag on it is stale too. Without
        // this, a payment flagged by one transient Paystack failure and then written off keeps the
        // flag forever, and the column stops meaning "needs a human".
        if (payment.reconciliation_error) await clearFlag(payment.id);
      } else summary.leftAlone += 1;
    } catch (error) {
      // Paystack could not be asked, so nothing is known about this reference and nothing is
      // written to it. The next run asks again; the flag is so a run that keeps failing is
      // visible rather than silent.
      summary.failed += 1;
      await flagForHuman(payment.id, error instanceof Error ? error.message : "Reconciliation failed");
    }
  }
  return summary;
}

/** Compare a caller's secret in constant time, refusing an unconfigured one outright. */
function isValidScheduledSecret(received: string, configured: string) {
  if (!configured || !received) return false;
  const receivedBuffer = Buffer.from(received);
  const configuredBuffer = Buffer.from(configured);
  return receivedBuffer.length === configuredBuffer.length && crypto.timingSafeEqual(receivedBuffer, configuredBuffer);
}

/**
 * The machine-triggered reconciliation endpoint, registered beside the Paystack webhook.
 *
 * Not on the tRPC router: the caller is a scheduler, not a browser session, and it carries a
 * shared secret rather than a Learner's credential. The schedule itself lives in this
 * repository as a workflow - tickets 28, 30 and 31 were each a setting nobody could see from
 * the code, and each cost hours. A schedule in a file is reviewable in a pull request.
 *
 * Named for the one thing it registers rather than for the `/api/scheduled/` prefix, so that a
 * second scheduled task arriving later has to say so here instead of hiding inside a plural.
 */
export function registerReconciliationEndpoint(app: Express) {
  app.post("/api/scheduled/reconcile-payments", async (req: Request, res: Response) => {
    // An unset variable must never mean an open door. This endpoint grants Full Access, so a
    // deploy that forgot the secret refuses everyone rather than admitting everyone.
    if (!ENV.scheduledTasksSecret) return res.status(503).json({ error: "Scheduled tasks are not configured" });
    if (!isValidScheduledSecret(req.header("x-spellcode-scheduled-secret") ?? "", ENV.scheduledTasksSecret)) return res.status(401).json({ error: "Invalid scheduled task secret" });
    try {
      return res.status(200).json(await reconcileUnfinishedPayments());
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Reconciliation failed" });
    }
  });
}
