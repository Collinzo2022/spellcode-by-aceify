import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { supabaseAdminRequest } from "./supabase";

type Plan = { id: string; code: string; name: string; currency: string; amount_minor: number; interval: "one_time" | "monthly"; max_installments: number | null; paystack_plan_code: string | null; is_active: boolean };
type PaymentRecord = { id: string; user_id: string; plan_id: string | null; paystack_reference: string; amount_minor: number; currency: string; status: string };

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

export async function initializeCheckout(input: { userId: string; email: string; planCode: string; callbackUrl: string }) {
  const plans = await supabaseAdminRequest<Plan[]>(`/rest/v1/plans?code=eq.${encodeURIComponent(input.planCode)}&select=id,code,name,currency,amount_minor,interval,max_installments,paystack_plan_code,is_active`);
  const plan = plans[0];
  if (!plan?.is_active) throw new Error("This access plan is not available right now.");
  if (plan.interval !== "one_time" && !plan.paystack_plan_code) throw new Error("This installment plan is not configured yet.");
  if (!input.email) throw new Error("A verified email address is required to start payment.");
  const existingAccess = await supabaseAdminRequest<Array<{ status: string }>>(`/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(input.userId)}&plan_id=eq.${plan.id}&status=in.(pending,active,past_due)&select=status&limit=1`);
  if (existingAccess.length > 0) throw new Error(existingAccess[0].status === "pending" ? "A payment for this plan is already in progress." : "You already have access through this plan.");
  const reference = `spellcode-${crypto.randomUUID()}`;
  const result = await paystackRequest<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", { method: "POST", body: JSON.stringify(buildPaystackInitializePayload({ email: input.email, reference, plan, callbackUrl: input.callbackUrl, userId: input.userId })) });
  const [payment] = await supabaseAdminRequest<PaymentRecord[]>("/rest/v1/payment_transactions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: input.userId, plan_id: plan.id, paystack_reference: result.reference, amount_minor: plan.amount_minor, currency: plan.currency, status: "initialized", provider_payload: { access_code: result.access_code, plan_code: plan.code } }) });
  await supabaseAdminRequest("/rest/v1/subscriptions", { method: "POST", body: JSON.stringify({ user_id: input.userId, plan_id: plan.id, status: "pending", installments_due: plan.max_installments ?? 1, installments_paid: 0, plan_snapshot: { plan_code: plan.code } }) });
  return { authorizationUrl: result.authorization_url, reference: result.reference, paymentId: payment.id };
}

function parseMetadata(metadata: unknown) { try { return typeof metadata === "string" ? JSON.parse(metadata) : metadata as Record<string, unknown>; } catch { return {}; } }

export async function verifyCheckout(reference: string, expectedUserId: string) {
  const payments = await supabaseAdminRequest<PaymentRecord[]>(`/rest/v1/payment_transactions?paystack_reference=eq.${encodeURIComponent(reference)}&select=id,user_id,plan_id,paystack_reference,amount_minor,currency,status`);
  const payment = payments[0];
  if (!payment || payment.user_id !== expectedUserId) throw new Error("Payment transaction not found.");
  const transaction = await paystackRequest<{ id: number; status: string; amount: number; currency: string; paid_at: string | null; authorization?: { authorization_code?: string }; customer?: { customer_code?: string }; plan?: { plan_code?: string } | null }>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
  if (transaction.status !== "success" || transaction.amount !== payment.amount_minor || transaction.currency !== payment.currency) throw new Error("Payment has not been verified yet.");
  await recordVerifiedPayment(payment, transaction);
  return { verified: true, status: "success" as const };
}

async function recordVerifiedPayment(payment: PaymentRecord, transaction: { id: number; status: string; amount: number; currency: string; paid_at: string | null; authorization?: { authorization_code?: string }; customer?: { customer_code?: string }; plan?: { plan_code?: string } | null }) {
  if (payment.status === "success") return;
  await supabaseAdminRequest(`/rest/v1/payment_transactions?id=eq.${payment.id}`, { method: "PATCH", body: JSON.stringify({ status: "success", paystack_transaction_id: String(transaction.id), paystack_authorization_code: transaction.authorization?.authorization_code ?? null, paid_at: transaction.paid_at ?? new Date().toISOString(), provider_payload: transaction, updated_at: new Date().toISOString() }) });
  if (payment.plan_id) {
    const plans = await supabaseAdminRequest<Plan[]>(`/rest/v1/plans?id=eq.${payment.plan_id}&select=id,interval,max_installments`);
    const plan = plans[0];
    const subscriptions = await supabaseAdminRequest<Array<{ id: string; installments_paid: number; installments_due: number | null }>>(`/rest/v1/subscriptions?user_id=eq.${payment.user_id}&plan_id=eq.${payment.plan_id}&status=in.(pending,active,past_due)&select=id,installments_paid,installments_due&order=created_at.desc&limit=1`);
    const subscription = subscriptions[0];
    const installmentsDue = subscription?.installments_due ?? plan?.max_installments ?? 1;
    const installmentsPaid = Math.min(installmentsDue, (subscription?.installments_paid ?? 0) + 1);
    const patch = { status: "active", paystack_customer_code: transaction.customer?.customer_code ?? null, current_period_start: new Date().toISOString(), installments_paid: installmentsPaid, installments_due: installmentsDue, last_payment_at: transaction.paid_at ?? new Date().toISOString(), updated_at: new Date().toISOString() };
    if (subscription) await supabaseAdminRequest(`/rest/v1/subscriptions?id=eq.${subscription.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    else await supabaseAdminRequest("/rest/v1/subscriptions", { method: "POST", body: JSON.stringify({ user_id: payment.user_id, plan_id: payment.plan_id, ...patch, plan_snapshot: { source: "paystack" } }) });
  }
}

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
  if (!plan) return null;
  const subscriptionQuery = userId
    ? `/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&plan_id=eq.${plan.id}&status=in.(active,past_due)&select=id,user_id,plan_id&order=updated_at.desc&limit=1`
    : `/rest/v1/subscriptions?paystack_customer_code=eq.${encodeURIComponent(customerCode)}&plan_id=eq.${plan.id}&status=in.(active,past_due)&select=id,user_id,plan_id&order=updated_at.desc&limit=1`;
  const subscriptions = await supabaseAdminRequest<Array<{ id: string; user_id: string; plan_id: string }>>(subscriptionQuery);
  const subscription = subscriptions[0];
  if (!subscription) return null;
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
  if (!plan) return;
  const subscriptions = await supabaseAdminRequest<Array<{ id: string; installments_paid: number; installments_due: number | null }>>(`/rest/v1/subscriptions?plan_id=eq.${plan.id}&paystack_customer_code=eq.${encodeURIComponent(customerCode)}&select=id,installments_paid,installments_due&order=updated_at.desc&limit=1`);
  const subscription = subscriptions[0];
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
      await supabaseAdminRequest(`/rest/v1/paystack_webhook_events?event_id=eq.${eventId}`, { method: "PATCH", body: JSON.stringify({ processed_at: new Date().toISOString() }) });
      return res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      await supabaseAdminRequest(`/rest/v1/paystack_webhook_events?event_id=eq.${eventId}`, { method: "PATCH", body: JSON.stringify({ processing_error: message.slice(0, 500) }) }).catch(() => undefined);
      return res.status(500).json({ error: message });
    }
  });
}
