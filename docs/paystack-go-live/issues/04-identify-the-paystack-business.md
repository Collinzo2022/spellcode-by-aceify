# 04: identify the Paystack business

**Type:** task (HITL: the operator, in the Paystack dashboard)
**Status:** open
**Blocked by:** none

## Question

Which of the two similarly named Paystack businesses is SpellCode's, by name?

The test, from domain-model-alignment ticket 30 ("How to tell the businesses apart"): **the correct business is the one whose transaction list contains `spellcode-963cdeab-a97c-40e4-8b2f-16a20889c376`.** Dashboard links can't target a business, so use the switcher at the top left.

Done when ticket 30 names both businesses (its "What to do", item 1), and records which one holds the live webhook URL. The live secret key used in [08](08-run-the-cutover.md) must come from this business.
