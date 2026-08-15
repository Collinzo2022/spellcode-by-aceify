import { describe, expect, it } from "vitest";
import { buildPaystackInitializePayload } from "./paystack";

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
