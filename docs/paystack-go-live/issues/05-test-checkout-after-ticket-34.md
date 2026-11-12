# 05: the test checkout owed since ticket 34

**Type:** task (HITL: the operator, in a browser with Paystack's test card)
**Status:** open
**Blocked by:** 02

## Question

Does a checkout through the current `initializeCheckout` (rewritten by ticket 34; ticket 36's redirect added) complete end to end in test mode?

Run `bash docs/domain-model-alignment/operator-remainder.sh` and take the stage "Ticket 34: the test-mode checkout that is still owed". Use a **brand-new** test Learner, because the stage-10 account holds an active Subscription and the access guard correctly refuses it. On success, the stage records `checkout34` in `.operator-remainder.state`. **Never write that marker by hand.**

Done when: payment `success` and subscription `active` are read back from production, `checkout34` is recorded, and the new account's `user_id` is written next to `5499b299…` in domain-model-alignment ticket 32 and on the launch map (decision 4 in [01](01-charting-decisions.md)). If it fails, the failure is the next ticket. Don't proceed to [08](08-run-the-cutover.md).
