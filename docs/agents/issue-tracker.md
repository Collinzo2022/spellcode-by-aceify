# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## In this repo

The active feature directory is `.scratch/domain-model-alignment/`, holding `spec.md`, a
`handoff.md` recording the decisions behind the effort, and 20 issues at `issues/NN-<slug>.md`.
Commit messages reference these by number as "ticket NN", so the numbering is load-bearing:
`git log --grep 'ticket 14'` is how you find the work for an issue.

`.scratch/` is **gitignored** (`.gitignore:123`). Issues are local to this working copy: they are
not pushed, not shared, and not backed up. A fresh clone has no issue history at all. Anything
that must outlive this machine belongs in a commit message, in `docs/`, or in an ADR.

Two consequences worth knowing before you search:

- `git ls-files` will never find a ticket. Read the directory instead.
- A ticket's own `Status:` line is the authority on whether it is done, not the commit log.
  Several issues are recorded as done while still carrying deliberately unticked boxes that
  need a real database.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
