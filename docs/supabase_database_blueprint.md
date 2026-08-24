# SpellCode by Aceify — Supabase Database Blueprint

This blueprint separates **identity**, **learning content**, **learner progress**, **saved coding work**, and **commercial access**. It is designed for Supabase Auth: Supabase owns user credentials in `auth.users`; the application stores learner-facing profile data in `public.profiles`.

## Core tables

| Area | Tables | Purpose |
|---|---|---|
| Identity | `profiles` | Learner name, avatar, role, and public profile details linked one-to-one with `auth.users`. |
| Curriculum | `tracks`, `lessons`, `challenges` | HTML, CSS, and JavaScript learning content, difficulty, order, theory, and validation requirements. |
| Learning | `enrollments`, `lesson_progress`, `challenge_attempts`, `activity_events` | Track selection, lesson completion, scores, XP, streak-relevant activity, and the activity feed. |
| Coding work | `coding_workspaces` | A learner's HTML, CSS, and JavaScript workspace state per lesson. |
| Projects | `projects`, `project_steps`, `project_progress` | Guided landing-page and calculator projects, milestone completion, and a project submission URL. |
| Recognition | `awards`, `user_awards` | Award definitions and Earned Awards. |
| Payments | `plans`, `subscriptions`, `payment_transactions`, `paystack_webhook_events` | Paid plans, Paystack references, verification state, access expiry, and idempotent webhook handling. |

## Required application values

| Item | Recommended data |
|---|---|
| `profiles.role` | `learner`, `instructor`, or `admin`. |
| Track labels | Store exactly `HTML`, `CSS`, and `JavaScript`. |
| Difficulty labels | Store exactly `Beginner`, `Intermediate`, and `Advanced`. |
| Lesson status | `not_started`, `in_progress`, `completed`. |
| Subscription status | `inactive`, `pending`, `active`, `past_due`, `cancelled`, or `expired`. |
| Payment status | `initialized`, `success`, `failed`, `abandoned`, `refunded`, or `disputed`. |

## Paystack data to store

Never treat a browser redirect as proof of payment. Store the `reference` generated for the transaction, verify it on the server, and use a webhook record to ensure duplicate delivery does not grant access twice. The `payment_transactions` table retains the amount in the lowest currency unit, currency, Paystack reference, authorization code, and full provider payload for audit/reconciliation. The `subscriptions` table is the **source of truth for access** in the app.

> **Security rule:** The Paystack secret key and the Supabase service-role key stay exclusively on the server. The Paystack public key and Supabase anon key may be used by web and Android clients, but they do not authorize privileged operations.

## Decisions needed before implementation

| Decision | Example choice |
|---|---|
| Monetization model | Free tier plus monthly and annual Pro subscription, or one-time cohort/course purchase. |
| Currency and country | For example, NGN for Nigeria or GHS for Ghana. |
| Paid access | A single Full Access gate covering all lessons, project publishing, certificates, and the AI tutor together. Settled in ADR 0001; there are no per-feature tiers. |
| Plans | Display name, Paystack plan code, interval, amount, and trial policy. |
| Refund / access policy | Whether a refund immediately revokes paid access or lets it run until period end. |
| Admin workflow | Who can publish lessons, create plans, and view payment records. |

## Credentials and configuration to provide securely

When the Supabase project is ready, provide the project URL, anon/public key, and service-role key. For Paystack, provide the public key and secret key plus the intended currency, plan codes, and allowed return URL(s). Please provide secret values only through the secure secret-entry cards that will appear during setup, not in normal chat or a GitHub repository.

## Recommended setup order

First, create the Supabase project and run `supabase_schema_draft.sql`. Then enable Supabase Email authentication and add the deployed web domain plus the Android deep-link return URL to the allowed redirect list. Next, create the Paystack plan(s), give the app the plan metadata, and configure a Paystack webhook to the application server endpoint after it is implemented. Finally, the same Supabase-backed API can be shared by the web app and Android app.
