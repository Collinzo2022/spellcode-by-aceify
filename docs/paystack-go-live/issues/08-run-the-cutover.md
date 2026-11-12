# 08: run the cutover

**Type:** task (HITL: the operator, with Render, Paystack live and `/admin`)
**Status:** open
**Blocked by:** 04, 05, 06, 07, 10

## Question

Is production running on the live secret key from the right business, with the live installment codes written onto Inactive plans?

Run the amended `bash docs/domain-model-alignment/cutover-wizard.sh` up to the end of its read-back stage, stopping before the live proof (that's [09](09-live-proof.md)). Read Render's restart back through `/api/version`'s `startedAt`, and the plans back through `billing.adminPlans`.

Done when: the key's last four characters, its business and the date are in the handoff; both `PLN_` codes are recorded; and `accessOptions` still returns only the one-time plan.
