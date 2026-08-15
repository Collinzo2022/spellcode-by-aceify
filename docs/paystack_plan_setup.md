# Paystack Plan Setup — SpellCode by Aceify

Create the following plans in the Paystack dashboard using **NGN**. Amounts are listed both as a customer-facing price and the value to store in `plans.amount_minor` (kobo).

| Application code | Paystack dashboard name | Customer price | Interval | Maximum charges | `amount_minor` |
|---|---|---:|---|---:|---:|
| `full-access-one-time` | Full Access (One-time) | ₦120,000 | One-time | 1 | 12,000,000 |
| `full-access-3-month` | Full Access (3-Month Installment) | ₦40,000 each month | Monthly | 3 | 4,000,000 |
| `full-access-6-month` | Full Access (6-Month Installment) | ₦20,000 each month | Monthly | 6 | 2,000,000 |

The monthly plans should be configured as recurring monthly billing in Paystack. The application will store `max_installments` as 3 or 6 and, after each verified charge, will update `installments_paid`; it will not initiate or accept additional charges after that cap.

All three plans grant: all lessons beyond Level 1, project publishing/live deployment, certificate eligibility, and unlimited AI tutor usage. Keep each plan **inactive** in the `plans` table until its matching Paystack plan code is added and the checkout flow has been tested.

After creating the plans, send the plan code shown by Paystack for each recurring plan. If Paystack does not issue a plan code for the one-time offering, send the price only; the server will initialize it as a one-off transaction rather than a recurring subscription.
