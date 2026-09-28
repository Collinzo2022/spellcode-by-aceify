import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));
vi.mock("./supabase", () => ({ supabaseAdminRequest: supabaseRequest }));
import { findOrCreateRecurringPayment } from "./paystack";
import { TEST_INSTALLMENT_PLAN } from "./testing/paystackPlans";

const event = { reference: "renewal-002", amount: 4000000, currency: "NGN", metadata: { user_id: "learner-1", plan_code: "full-access-3-month" }, plan: { plan_code: "PLN_3MONTH" }, customer: { customer_code: "CUS_123" } };

describe("recurring Paystack payment records", () => {
  beforeEach(() => supabaseRequest.mockReset());
  it("creates a new payment record for a unique recurring charge reference", async () => {
    supabaseRequest.mockResolvedValueOnce([]).mockResolvedValueOnce([TEST_INSTALLMENT_PLAN]).mockResolvedValueOnce([{ id: "sub-1", user_id: "learner-1", plan_id: "plan-1" }]).mockResolvedValueOnce([{ id: "payment-2", user_id: "learner-1", plan_id: "plan-1", paystack_reference: "renewal-002", amount_minor: 4000000, currency: "NGN", status: "initialized" }]);
    await expect(findOrCreateRecurringPayment(event)).resolves.toMatchObject({ id: "payment-2", paystack_reference: "renewal-002" });
    expect(supabaseRequest).toHaveBeenCalledTimes(4);
  });

  it("does not create a duplicate record when the recurring reference has already been processed", async () => {
    supabaseRequest.mockResolvedValueOnce([{ id: "payment-2", user_id: "learner-1", plan_id: "plan-1", paystack_reference: "renewal-002", amount_minor: 4000000, currency: "NGN", status: "success" }]);
    await expect(findOrCreateRecurringPayment(event)).resolves.toMatchObject({ id: "payment-2", status: "success" });
    expect(supabaseRequest).toHaveBeenCalledTimes(1);
  });
});
