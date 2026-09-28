/**
 * The installment Plan every Paystack test stubs, in one place.
 *
 * Three test files had their own verbatim copy. Plans are read by four code paths
 * with four different `select=` lists, so a copy that drifted - a missing
 * `max_installments`, a different `paystack_plan_code` - would weaken whichever
 * file held it while the others kept passing.
 */
export const TEST_INSTALLMENT_PLAN = { id: "plan-1", code: "full-access-3-month", name: "Full Access", currency: "NGN", amount_minor: 4000000, interval: "monthly" as const, max_installments: 3, paystack_plan_code: "PLN_3MONTH", is_active: true };
