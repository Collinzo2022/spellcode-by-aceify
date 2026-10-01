# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `docs/`.

## Conventions

- One feature per directory: `docs/<feature-slug>/`
- The spec is `docs/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `docs/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `docs/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## In this repo

The active feature directory is `docs/domain-model-alignment/`, holding `spec.md`, a
`handoff.md` recording the decisions behind the effort, 36 issues at `issues/NN-<slug>.md`, and the
three wizards. `switch-wizard.sh` (ticket 20) and `finish-switch-wizard.sh`, which covers its
remainder, both have **no resume state and must not be re-run** — re-running the second walks back
through its stage 7, which cannot succeed and does not notice, so the run reads clean while the work
stays open. `operator-remainder.sh` is the third and **does** resume: it re-probes what it can read
and offers to skip the rest, which is why it is the one to reach for.
Commit messages reference these by number as "ticket NN", so the
numbering is load-bearing: `git log --grep 'ticket 14'` is how you find the work for an issue.

**These files were in `.scratch/` and gitignored until 2026-09-25, when the whole directory moved
into `docs/` and became tracked.** That reverses what this document used to say, so beware of
anything written before that date claiming a ticket is unshared or uncommitted — several tickets
carried such lines and have been corrected in place.

Three consequences worth knowing:

- **They are tracked, so they are shared.** Anyone with repo access reads them, including
  contributors who are not working in Claude Code. Write them accordingly. **No secrets**: this
  already held when the directory was private and matters more now.
- **Edits belong in commits.** A ticket whose `Status:` changes is a working-tree change like any
  other; `git status` will show it, and leaving it uncommitted means the next clone disagrees with
  this one.
- A ticket's own `Status:` line is the authority on whether it is done, not the commit log.
  Several issues are recorded as done while still carrying deliberately unticked boxes that
  need a real database.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `docs/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `docs/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `docs/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
