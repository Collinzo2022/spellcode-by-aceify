# 31: the Manus-era Supabase project is still running, and the owner cannot pause it

**Status:** open, `ready-for-human`. Found 2026-09-28 while taking switch stage 11 by hand. **Operator
work, and partly not the operator's to do** — the project sits in an organization the project owner
is not an admin of.

**There is no code defect here.** Nothing in this repository points at the project. What is open is a
credential and data-retention exposure of unestablished size, and it is the reason **switch stage 11
is only half done**.

## There were three projects, not two

Every document in this effort — `switch-wizard.sh`, `finish-switch-wizard.sh:204-205`, the handoff —
was written assuming two Supabase projects: the old one and the new one. There are three.

Measured 2026-09-28 with an unauthenticated `GET /rest/v1/`, which distinguishes a running project
(`401 No API key found in request`) from a paused one (does not resolve):

| ref | reachable | what it is |
|---|---|---|
| `jttycbhcziffiukpcwvd` | `401` — **running** | live production, created 2026-09-23 by switch stage 3 |
| `geewhajddtzoisumbbek` | **unreachable** | an intermediate attempt. **Paused 2026-09-28** by the owner |
| `mgsbipibzzwrvnseftar` | `401` — **running** | the earlier attempt, linked to Manus. **Cannot be paused** |

The live one was confirmed post-alignment by reading it, not by trusting the ref: `plans.paid_features`
returns `42703`, its three plan rows match ticket 30's readings, and the owner separately confirmed in
the dashboard that `.env`'s anon and service-role keys both belong to it.

## Why stage 11 is not closed by the pause that happened

Stage 11 says "pause the old Supabase project", singular, and
`finish-switch-wizard.sh:438` guards it with "the LIVE project is `jttycbhcziffiukpcwvd`, do not pause
that one" — a guard that is correct and insufficient, because it assumes the only other project is the
one to pause.

`geewhajddtzoisumbbek` was paused and that was right. But **the pre-alignment project is
`mgsbipibzzwrvnseftar`**, and it is the one still running. So the stage's intent — the old data is no
longer live — is unmet.

**Pausing is reversible**, so the pause already performed costs nothing if it turns out
`geewhajddtzoisumbbek` was wanted after all. Restoring is a dashboard action.

## The exposure

The owner is a member of the organization holding `mgsbipibzzwrvnseftar` but **not an admin, and has
no permission to pause it**. Read that at face value: a database from the Manus era is running, and
the person who owns the product cannot switch it off.

Nothing in this repository talks to it — `.env` holds only `jttycbhcziffiukpcwvd`, and ticket 20
stage 6 pointed `/api/*` away from the dead Manus host — so **it is not serving Learners today.** The
exposure is not traffic, it is access:

- Its anon and service-role keys exist wherever the Manus deployment's environment lived, which is a
  third party the project is deliberately leaving.
- Whoever administers that organization can read everything in it.
- The owner cannot revoke either, because revocation is an admin action.

**This is the same shape as ticket 26** — a credential left somewhere it should no longer live — with
the difference that deleting the thing is not the owner's to do. Ticket 26 was closed by deletion in
a minute. This one cannot be.

## What is not established, and decides how much this matters

1. **Does it hold real Learner data?** If the Manus attempt never had users beyond the owner's own
   test accounts, this is a tidy-up and should be recorded as one. If real people signed up against
   it, it is a data-retention question with a deadline attached. **Establish this first; everything
   below scales off the answer.** The owner can read the project, so `auth.users` and the pre-alignment
   equivalents of `profiles` will answer it.
2. **What permissions does the owner actually have on it?** "Cannot pause" narrows it but does not
   settle it. Worth checking, in rising order of usefulness: can they **rotate** the service-role and
   anon keys (Settings → API)? Can they **delete rows**? Can they request **ownership transfer** of
   the project or the organization? Each is a different mitigation and at least one is likely available.
3. **Who administers that organization?** Manus itself, or an account created on the owner's behalf
   during the Manus build. If the latter, recovering it may only need a password reset.

## What to do

In order, cheapest first:

1. **Establish (1) above** — whether there is real Learner data in it. Record the answer in this file.
2. **Rotate its keys if permitted.** Nothing uses them, so rotation breaks nothing and immediately
   cuts off any third party still holding them. This is the highest-value action available without
   admin rights, and it should not wait on the ownership question.
3. **Pursue ownership or admin rights** on that organization, then pause or delete the project. Only
   this closes stage 11 as written.
4. **Record the outcome in the handoff**, and correct `finish-switch-wizard.sh`'s stage 8 if it is ever
   re-authored: its guard names one project to avoid and should name the project to *act on*.

**Not a launch gate.** It serves no Learner and blocks no feature. But it is the third duplicate found
in one week, and the two before it each cost real time.

## The pattern, which is now worth naming

Three duplicates in a week, each invisible until something failed against the wrong copy:

- **Two Paystack businesses** — ticket 30. A ₦120,000 payment charged on the one the application
  cannot see.
- **Two Vercel projects** — ticket 26. A stale build authenticated to the live database for four days,
  which cost a real checkout attempt.
- **Three Supabase projects** — this ticket. A stage written for two.

Ticket 30 drew the lesson "looking at a field is not enough if you have not established which business
you are looking at." This adds the counting: **establish how many copies exist before acting on one.**
Every one of these was found by measuring rather than by reading a dashboard, and in each case the
document describing the work had confidently assumed a smaller number.

## Related

- **Ticket 26.** Same exposure shape, closed by deletion. Its unanswered rotation question (did the
  deleted Vercel project hold the service-role key?) is about the **live** project; this ticket's
  rotation question is about `mgsbipibzzwrvnseftar`. Two different keys, do not conflate them.
- **Ticket 30.** The duplicate-copy pattern, and the `963cdeab` fingerprint technique — identify by
  data, not by name.
- **Switch stage 11**, which this ticket leaves half open. The handoff's "What is left, in order"
  records that.

No secrets appear in this file. The three project refs are public identifiers, present in any URL the
projects serve; no key was read or recorded.
