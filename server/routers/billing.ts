import { learnerIdOf } from "../learner";
import { z } from "zod";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { initializeCheckout, verifyCheckout } from "../paystack";
import { supabaseAdminRequest } from "../supabase";
import { verifyFullAccess } from "../supabaseLearning";

type PlanRow = { id: string; code: string; name: string; currency: string; amount_minor: number; interval: "one_time" | "monthly" | "quarterly" | "annually"; max_installments: number | null; paystack_plan_code: string | null; is_active: boolean };

/** Every column of a Plan, kept beside `PlanRow` so the two cannot drift apart. */
const PLAN_SELECT = "/rest/v1/plans?select=id,code,name,currency,amount_minor,interval,max_installments,paystack_plan_code,is_active&order=amount_minor.desc";

export const billingRouter = router({
  accessOptions: publicProcedure.query(async () => {
    const plans = await supabaseAdminRequest<PlanRow[]>(PLAN_SELECT);
    return plans;
  }),
  myAccess: protectedProcedure.query(async ({ ctx }) => verifyFullAccess(learnerIdOf(ctx.user))),
  startCheckout: protectedProcedure.input(z.object({ planCode: z.string().min(1).max(80) })).mutation(async ({ ctx, input }) => {
    const host = ctx.req.get("host");
    const callbackUrl = `${ctx.req.protocol}://${host}/payment/complete`;
    return initializeCheckout({ userId: learnerIdOf(ctx.user), email: ctx.user.email ?? "", planCode: input.planCode, callbackUrl });
  }),
  verifyCheckout: protectedProcedure.input(z.object({ reference: z.string().min(8).max(180) })).mutation(async ({ ctx, input }) => verifyCheckout(input.reference, learnerIdOf(ctx.user))),
  adminPlans: adminProcedure.query(async () => supabaseAdminRequest<PlanRow[]>(PLAN_SELECT)),
  updatePlan: adminProcedure.input(z.object({ code: z.string().min(1).max(80), amountMinor: z.number().int().min(0), isActive: z.boolean(), paystackPlanCode: z.string().max(120).nullable() })).mutation(async ({ input }) => {
    await supabaseAdminRequest(`/rest/v1/plans?code=eq.${encodeURIComponent(input.code)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ amount_minor: input.amountMinor, is_active: input.isActive, paystack_plan_code: input.paystackPlanCode || null, updated_at: new Date().toISOString() }) });
    return { updated: true };
  }),
  adminLearnerBilling: adminProcedure.query(async () => {
    return supabaseAdminRequest<Array<{ user_id: string; display_name: string | null; xp: number; subscription_status: string | null; current_period_end: string | null; installments_paid: number | null; installments_due: number | null; latest_payment_status: string | null; latest_payment_amount_minor: number | null; latest_payment_currency: string | null }>>("/rest/v1/admin_learner_billing_summary?select=*&order=display_name.asc");
  }),
});
