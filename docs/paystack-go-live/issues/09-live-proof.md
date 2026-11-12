# 09: the live proof

**Type:** task (HITL: the operator, with a real card)
**Status:** open
**Blocked by:** 03, 08

## Question

Does a real-money Payment grant Full Access through the live webhook?

Run the wizard's closing stages ([06](06-amend-cutover-wizard.md)): set the price window to **₦100** (`amount_minor 10000`; [01](01-charting-decisions.md), amended) at a quiet hour, buy once with a fresh account, and read back payment `success`, subscription `active` and a `charge.success` in `paystack_webhook_events` with `processing_error: null`. Then restore ₦120,000 and confirm through `accessOptions`. Don't refund (decision 3).

If it fails, roll back to `sk_test` (decision 9), and the failure becomes a new ticket. Note how long the webhook took, which feeds the "Render sleeping" fog on the map.

**Reaching this ticket's answer reaches the map's destination.**

**What this proof doesn't cover:** the fee rule above ₦2,500, and the payout reaching the bank (₦98.50 stays in the Paystack balance). Watch both on the first real sale.
