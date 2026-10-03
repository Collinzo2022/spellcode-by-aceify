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

## Running the dev server

**`npm run dev` works.** Three documents in this repo once said it could not start on this machine,
and that false belief was cited as the reason three separate things could not be proved — for eight
days, because nobody re-tested a "cannot". See ticket 37 for the readings.

Run it from a shell **with stdout redirected to a file**, then poll `http://localhost:3000/`. On the
first run after a dependency or config change, wait out `Re-optimizing dependencies`.

Three ways to measure this wrongly, two of them demonstrated during the investigation:

1. **Piping into a consumer that exits.** `npx vite … | head` prints nothing and reads as a hang;
   the same binary redirected to a file reported ready in under half a second. **A piped
   observation of this server is not evidence about the server.**
2. **Probing the `127.0.0.1` literal.** Bare `vite` binds `[::1]` only, so the IPv4 literal is
   refused while the server is serving. `npm run dev` binds `0.0.0.0` and `[::]` both — poll
   `localhost`, not the literal.
3. **Giving up during dependency optimization.** A probe with a short timeout reads
   `Re-optimizing dependencies` as a hang.

## Running the dev server under a preview harness

**A preview harness needs stdin redirected, or the server never binds.** The launcher must be

```
cmd /c "npm run dev < NUL"
```

not `npm run dev`. `.claude/launch.json`'s `dev` entry carries that, so `preview_start {name: "dev"}`
serves and the application renders in the pane. **That file is gitignored, so this does not travel** —
on a fresh clone, fix the entry before concluding anything about the server.

Why: `tsx watch` hands its child a stdin handle that, under the harness, **blocks forever the first
time anything constructs `process.stdin`**. The child starts, loads most of the application, and
stops dead with no output, no port and no error. `< NUL` is the whole fix. Ticket 37's second
`## Comments` entry has the trace, the four hypotheses and the mutation proof.

**Two things this costs you if you forget it.** A harness reports **"Server started successfully"**
while nothing is listening — so **assert on the port, never on the launcher's own result**:

```
netstat -ano | grep -cE ':3000\s+.*LISTENING'
```

And the failure looks exactly like the "cannot start" this repo wrongly believed for eight days. **No
output and no port is not evidence the server is broken.**

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
