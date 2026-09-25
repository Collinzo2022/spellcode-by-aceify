# AGENTS.md

Configuration for coding agents working in this repo.

## Agent skills

### Issue tracker

Issues live as markdown files under `docs/<feature>/issues/`, not on GitHub, and are **tracked** —
they moved out of a gitignored `.scratch/` on 2026-09-25, so editing one is a committable change.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unchanged, recorded as a `Status:` line in each issue file. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Replay-order SQL

The files under `docs/*.sql` named in the replay order are not documentation. They are the only
record of how a fresh database is built, and they are replayed verbatim into an empty project.

**Never edit one in place under a commit whose subject does not say so.** A rename, a column, a
default or a seed row changed there changes every environment created from that day on, and no
migration exists to carry the change to environments created before it. The commit subject must
name the file and the change, and the body must say which environments are affected and why no
migration accompanies it. `2303c58` did none of that — it renamed
`subscriptions.entitlement_snapshot` to `plan_snapshot` under `docs: updated docs for better
clarity` with an empty body — and `docs/production_architecture.md` had to carry the explanation
afterwards because the history could not. See ticket 21.
