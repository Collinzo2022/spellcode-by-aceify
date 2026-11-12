# 06: amend the cutover wizard to the one-time scope

**Type:** task (AFK)
**Status:** open
**Blocked by:** 03

## Question

Does `docs/domain-model-alignment/cutover-wizard.sh` perform exactly the cutover decided in [01](01-charting-decisions.md)?

Changes, per decisions 2, 6, 7 and 8:
- **"Change 3 of 3: patch the plan codes":** still capture and write both live `PLN_` codes, but tell the operator to **leave both plans Inactive**. Today it says to click them Active.
- **The key stage:** only `PAYSTACK_SECRET_KEY` on Render matters, and `PAYSTACK_PUBLIC_KEY` is unused. Add the recording rule: date, business (from [04](04-identify-the-paystack-business.md)) and last four characters, written to the handoff.
- **Add the live proof as closing stages:** price window at ₦100 (`amount_minor 10000`, per [01](01-charting-decisions.md), amended after [03](03-paystack-minimum-charge.md)), purchase with a fresh account, read back `success`/`active`, restore ₦120,000, and the rollback rule (decision 9).
- **Keep the stage-7 gate** (the `checkout34` refusal) unchanged.

Done when the wizard reads correctly end to end (`bash -n` passes, every stage reviewed), and it's committed with a subject naming the change.
