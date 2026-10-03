# 31: the Manus-era Supabase project is still running, and the owner cannot pause it

**Status:** open, `ready-for-human`. Found 2026-09-28 while taking switch stage 11 by hand. **Operator
work, and partly not the operator's to do** — the project sits in an organization the project owner
is not an admin of.

**`geewhajddtzoisumbbek`'s pause is unverified** — see question 4 and `## Comments`. The remedy is
unchanged: key rotation on `mgsbipibzzwrvnseftar`.

**There is no code defect here.** Nothing in this repository points at the project. What is open is a
credential exposure, and it is the reason **switch stage 11 is only half done**.

**It holds no third-party data — established 2026-09-28, see "What is in it".** That was this ticket's
first question and it was the one everything else scaled off. The answer removes the retention
deadline and leaves key rotation as the whole of the remedy.

## There were three projects, not two

Every document in this effort — `switch-wizard.sh`, `finish-switch-wizard.sh`'s `LIVE_SUPABASE_REF`,
the handoff —
was written assuming two Supabase projects: the old one and the new one. There are three.

Measured 2026-09-28 with an unauthenticated `GET /rest/v1/`, which distinguishes a running project
(`401 No API key found in request`) from a paused one (does not resolve):

| ref | reachable | what it is |
|---|---|---|
| `jttycbhcziffiukpcwvd` | `401` — **running** | live production, created 2026-09-23 by switch stage 3 |
| `geewhajddtzoisumbbek` | ~~**unreachable**~~ — see question 4 | an intermediate attempt. ~~**Paused 2026-09-28**~~ by the owner |
| `mgsbipibzzwrvnseftar` | `401` — **running** | the earlier attempt, linked to Manus. **Cannot be paused** |

Row 2 is struck because the method cannot support it — see question 4. It is kept as measured rather
than deleted, so the reading that was taken is still visible next to the reason it proves less than
it looked like proving.

The live one was confirmed post-alignment by reading it, not by trusting the ref: `plans.paid_features`
returns `42703`, its three plan rows match ticket 30's readings, and the owner separately confirmed in
the dashboard that `.env`'s anon and service-role keys both belong to it.

## Why stage 11 is not closed by the pause that happened

Stage 11 says "pause the old Supabase project", singular, and
`finish-switch-wizard.sh`'s stage 8 guards it with `warn "The LIVE project is $LIVE_SUPABASE_REF. Do
not pause that one."` — a guard that is correct and insufficient, because it assumes the only other
project is the one to pause. Its next line, `step "Pick the older project, NOT $LIVE_SUPABASE_REF."`,
is the ambiguity itself: "the older project" names neither of the two it could mean.

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

## What is in it — established 2026-09-28

The owner opened the project (`mgsbipibzzwrvnseftar`, confirmed from the URL rather than from the
label "Bayozpel's Project", because naming has misled this effort twice) and read
**Authentication → Users**.

**Ten accounts. Every one belongs to the owner or to the single collaborator who built the Manus
version.** Six were read directly and the remaining four confirmed by the owner as also theirs. No
third party ever signed up against this project.

Addresses are deliberately not reproduced here. This directory is tracked and readable by everyone
with repo access, including the backend engineer on F2; the rest of it treats `user_id`s as opaque
for the same reason, and these would be the first personal data to land in the repository. The
counts and the characterisation are what the decision needs.

**So there is no retention deadline and nobody to notify.** This is tidy-up plus a live credential,
which is why "rotate the keys" below is the whole of the practical remedy and the ownership question
is housekeeping.

**One loose thread.** The most recently created account was made **2026-09-23 20:29** and last signed
in **2026-09-24 17:54** — a day *after* switch stage 3 created the live project. Something was still
authenticating against the Manus project after it was superseded. Most likely the owner, during the
week the `-two` confusion was live (tickets 20 and 26). Worth a moment before anyone pauses it: if
something is still pointed at it, pausing breaks that thing rather than nothing. Nothing in this
repository is — `.env` holds only `jttycbhcziffiukpcwvd`.

## What is not established, and decides how much this matters

1. ~~**Does it hold real Learner data?**~~ **Answered 2026-09-28 — no.** See "What is in it". Kept
   rather than deleted so the question is not asked again.
2. **What permissions does the owner actually have on it?** "Cannot pause" narrows it but does not
   settle it. Worth checking, in rising order of usefulness: can they **rotate** the service-role and
   anon keys (Settings → API)? Can they **delete rows**? Can they request **ownership transfer** of
   the project or the organization? Each is a different mitigation and at least one is likely available.
3. **Who administers that organization?** Manus itself, or an account created on the owner's behalf
   during the Manus build. If the latter, recovering it may only need a password reset.
4. **Is `geewhajddtzoisumbbek` actually paused, and does this ticket's probe prove a pause at all?**
   One question, not two, because the same reading answers both. It answered `401` on 2026-10-03,
   indistinguishable from the live project. **An unauthenticated `401` cannot tell paused from
   running** — it only separates a real project from a nonexistent one — so the method this ticket
   opens with proves less than its table claims. Either the project was restored, or a paused
   project keeps its gateway and **no pause in this effort was ever verified by probe**. The second
   is the more consequential and the cheaper to check: read Settings → General in the dashboard.
   `operator-remainder.sh`'s stage "Ticket 31: read whether the intermediate project is really
   paused" walks it, and changes nothing either way.

## What to do

In order, cheapest first:

1. ~~**Establish whether there is real Learner data in it.**~~ **Done 2026-09-28 — there is none.**
2. **Rotate its keys if permitted.** Nothing uses them, so rotation breaks nothing and immediately
   cuts off anyone still holding them. **This is now the whole of the remedy that matters**, and it
   is the highest-value action available without admin rights. It should not wait on step 3.
3. **Pursue ownership or admin rights** on that organization, then pause or delete the project. Only
   this closes stage 11 as written. With no third-party data in it, this is housekeeping rather than
   urgent — but leaving a running database in an organization you do not control is a standing
   liability, so it should not be dropped either.
4. **Record the outcome in the handoff**, and correct `finish-switch-wizard.sh`'s stage 8 if it is ever
   re-authored: its guard names one project to avoid and should name the project to *act on*.

**Not a launch gate.** It serves no Learner, holds no third party's data, and blocks no feature. But
it is the third duplicate found in one week, and the two before it each cost real time.

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

## Comments

### 2026-10-03 — the probe cannot prove a pause, which is worse than the pause having lapsed

Re-ran this ticket's own measurement. **`geewhajddtzoisumbbek` answers `401` again**, identically to
the live project.

| ref | DNS | `GET /rest/v1/` | 2026-09-28 | 2026-10-03 |
|---|---|---|---|---|
| `jttycbhcziffiukpcwvd` | `104.18.38.10` | `401` | running | running |
| `geewhajddtzoisumbbek` | `104.18.38.10` | `401` | unreachable | **answering** |
| `mgsbipibzzwrvnseftar` | `104.18.38.10` | `401` | running | running |
| `zzzzzzzzzzzzzzzzzzzz` (control) | **no DNS** | no response | — | — |

**The finding is about the method, not the project.** The control establishes one thing only: a ref
that does not exist fails DNS outright (`getaddrinfo failed`), so DNS is published per project and a
`401` means a real gateway answered. **It says nothing about paused versus running**, which is the
question this ticket's table answers with it. So the honest reading of row 2 is not "it was
restored" but "this measurement never distinguished the two states and still does not".

That is why question 4 is phrased as one question. Both candidate explanations — restored, or
paused-projects-answer-anyway — are live, and the second impeaches every "paused" claim in this
effort that rests on a `401`. The dashboard settles it in one look and the wizard stage walks there.

Worth noting the IP carries no information either way: all three refs resolve to the same Cloudflare
address, so a shared edge is expected and comparing IPs would prove nothing.

**What does not change.** `mgsbipibzzwrvnseftar` is the project stage 11 means, it is still running,
and **key rotation is still the whole of the practical remedy**. No step in "What to do" is affected,
and the status stays `ready-for-human`: every remaining action is a dashboard action, two of them
possibly needing rights the owner lacks.

**No code was written, and none was needed.** This ticket opens with "there is no code defect here"
and that still holds; `git grep` finds no tracked file pointing at either non-live ref except these
documents and `operator-remainder.sh`'s `MANUS_SUPABASE_REF` and `INTERMEDIATE_SUPABASE_REF`, both of
which exist in order to refuse to act on the wrong project.

**`finish-switch-wizard.sh` was deliberately left alone, so step 4 stays open.** Its stage 8 does
carry the defect this ticket describes — its `step` says to pick "the older project", which is
ambiguous between the two non-live refs and is how the wrong one came to be paused — but the script
must not be re-run, since its stage 7 cannot succeed and does not notice. Correcting a script nobody
should execute is not worth the diff, and step 4's condition is "if it is ever re-authored". Its
`LIVE_SUPABASE_REF` and its `warn "The LIVE project is …"` are the two symbols to fix if that day
comes. The wizard that *is* meant to run carries the reading instead, as its own stage, which
refuses if the intermediate ref ever collides with either of the others.

**The pattern section gains a third reading.** It already says *establish how many copies exist
before acting on one*. This adds: **know what your instrument measures before trusting what it
says about state.** The count was wrong first; now the thing the count was built on turns out not to
measure what it was read as measuring.
