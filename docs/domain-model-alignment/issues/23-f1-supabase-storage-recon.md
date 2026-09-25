# 23: F1 — publishing and certificates off Forge storage (reconnaissance only)

**Status:** **not started, and deliberately not next.** Opened 2026-09-24, paused the same day after
one grilling round. In handoff.md's "What is left", F1 is under **"The two Forge follow-ups"** (the
last item) and also a bullet — "Both Forge follow-ups done" — inside **"The launch checklist"**.
Stage 10, stage 11 and ticket 26 all come first. Referred to by name rather than by number: an
earlier revision of this file cited items 3 and 2, and the 2026-09-25 rewrite of handoff.md
renumbered that list out from under both. This file exists so the reconnaissance is not re-done.

**This is not a buildable ticket.** Four design questions are open and unanswered. Do not
`/implement` from it. Resume by re-opening the grilling with the facts below already in hand.

## What was established (facts, verified in the code)

**The write seam is clean.** `server/storage.ts` exposes `storagePut`, `storageGet` and
`storageGetSignedUrl`. Only `storagePut` has consumers — `server/routers/projects.ts:20` and
`server/routers/certificates.ts:38`. Swapping the write side is contained to one module.

**The read path is not, and this is the awkward part.** `/manus-storage/*` is served by
`server/_core/storageProxy.ts`, which presigns against Forge. `server/_core/**` is vendored scaffold
a regeneration clobbers, and the conventions say keep changes out of it. Any design that keeps a
proxy hop has to answer where that route lives.

**The URL shape is persisted, not computed.** `published_projects.public_url` and
`certificates.download_url` store literal `/manus-storage/{key}` strings written at publish time
(`projects.ts:21`, `certificates.ts:39`). The route name outlives Forge unless something rewrites
those rows.

**There is no Supabase SDK anywhere in this repo.** `@supabase/supabase-js` is in neither
`package.json` nor the client. Every Supabase call is hand-rolled `fetch` — `supabaseAdminRequest`
for PostgREST, and the auth REST endpoints directly. "Move to Supabase Storage" therefore forks on a
dependency decision before any storage decision.

**Both artifacts open in a browser tab, and both are HTML.** `Projects.tsx:23` does
`window.open(result.url)`; `Certificate.tsx:22` renders `<a href={download_url} target="_blank">`.
The published project embeds the Learner's own JavaScript (`documentSource`, `projects.ts:9`).
**Today that code executes on a third-party origin**, because `/manus-storage/` 307-redirects to S3.
That property must survive any move: serving Learner-authored HTML from the app's own origin would
be stored XSS against SpellCode.

**Today's links expire.** The proxy redirects to a presigned GET with `Cache-Control: no-store`
(`storageProxy.ts:43-44`). A shared "published" project link therefore dies. Whether that is a bug
or a feature is question 2 below.

## The four open questions

1. **Hand-roll the Storage REST calls, or take `@supabase/supabase-js`?** Recommendation was
   hand-roll, matching `server/supabase.ts`, since the SDK duplicates an auth client that already
   works and Storage would otherwise be the only part of Supabase reached a different way.
2. **Published projects: public bucket or signed URLs?** Recommendation was a public bucket — a
   permanent URL is what "publish" means, and it deletes the proxy route, which is the way out of
   `_core`.
3. **Certificates: public bucket or signed URLs?** Recommendation was public with an unguessable
   path (the certificate number is already in it), matching how credential services work — with the
   tradeoff stated plainly: the row stays RLS-protected, the file becomes world-readable to anyone
   holding the URL.
4. **Does F1 stay a launch gate?** Recommendation was yes, but sequenced behind the switch: Full
   Access sells four things and two are off, so the problem is selling that, not the storage.
   **This question is now effectively answered** — the 2026-09-24 course check confirmed the
   handoff's order stands.

## When it resumes

Questions 1–3 are still open and are the user's to settle. Note that F1 covers **two** capabilities
that may want different answers (2 vs 3), so it may split into two tickets rather than one.

**F2 is not this ticket and not this agent's.** It belongs to the user's backend engineer. The brief
lives in the sprint doc's Phase 4, written there because these files were gitignored and unreadable
to them; **since the 2026-09-25 move into `docs/` they can read this directory directly.** Two
people choosing an LLM provider independently is the risk to avoid.
