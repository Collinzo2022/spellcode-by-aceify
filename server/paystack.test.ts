import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { buildPaystackInitializePayload, isValidPaystackSignature, paystackLifecycleStatus } from "./paystack";

describe("Paystack checkout payload", () => {
  const base = { email: "learner@example.com", reference: "spellcode-reference", callbackUrl: "https://spellcode.example/payment/complete", userId: "user-1" };
  it("uses a direct NGN amount for one-time Full Access", () => {
    const payload = buildPaystackInitializePayload({ ...base, plan: { id: "1", code: "full-access-one-time", name: "Full Access", currency: "NGN", amount_minor: 12000000, interval: "one_time", max_installments: 1, paystack_plan_code: null, is_active: true } });
    expect(payload.amount).toBe("12000000");
    expect(payload.plan).toBeUndefined();
  });
  it("uses the configured Paystack plan and payment cap for installments", () => {
    const payload = buildPaystackInitializePayload({ ...base, plan: { id: "2", code: "full-access-3-month", name: "Installment", currency: "NGN", amount_minor: 4000000, interval: "monthly", max_installments: 3, paystack_plan_code: "PLN_123", is_active: true } });
    expect(payload.plan).toBe("PLN_123");
    expect(payload.invoice_limit).toBe(3);
  });
});

describe("Paystack webhook safety", () => {
  it("accepts only the matching SHA512 webhook signature", () => {
    const body = Buffer.from('{"event":"charge.success"}');
    const signature = crypto.createHmac("sha512", "test-secret").update(body).digest("hex");
    expect(isValidPaystackSignature(body, signature, "test-secret")).toBe(true);
    expect(isValidPaystackSignature(body, `${signature}0`, "test-secret")).toBe(false);
    expect(isValidPaystackSignature(body, signature, "other-secret")).toBe(false);
  });

  it("maps failed and completed recurring events to safe local subscription states", () => {
    expect(paystackLifecycleStatus("invoice.payment_failed", "")).toBe("past_due");
    expect(paystackLifecycleStatus("subscription.disable", "active")).toBe("expired");
    expect(paystackLifecycleStatus("invoice.update", "active")).toBe("active");
  });
});
