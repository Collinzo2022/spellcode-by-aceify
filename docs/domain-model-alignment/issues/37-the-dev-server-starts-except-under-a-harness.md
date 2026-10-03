# 37: the dev server starts, except under an automated harness

**Status:** **closed 2026-10-03**, the day it was opened. **Most of this is a correction rather than
a defect**: three documents record a dev server that cannot start, and `npm run dev` starts. The one
real failure — no bind under an automated preview harness — is **diagnosed and fixed**: the child
blocks constructing `process.stdin`, and `npm run dev < NUL` removes it. See the second
`## Comments` entry. **The preview pane now serves and renders this application**, which it has never
done before on this project.

## What was measured, 2026-10-03, at `7341316`

`npm run dev`, launched from a shell with stdout redirected to a file:

```
stdout         "Server running on http://localhost:3000/"
netstat :3000  0.0.0.0:3000   LISTENING
               [::]:3000      LISTENING
curl localhost HTTP=200  text/html; charset=utf-8
curl 127.0.0.1 HTTP=200
/api/version   {"commit":null,"branch":null,"repo":null,"service":null,
                "startedAt":"2026-10-03T13:19:17.458Z"}
```

The application rendered in a browser at `http://localhost:3000/`. The console carried no errors —
`[vite] connecting` then `connected`, React DevTools' notice, and `[Manus] Debug collector
initialized` (ticket 22). `/api/version` returning `null` for every Render-supplied field with a real
`startedAt` is correct behaviour off-Render, and is the first time that route has been exercised
without its environment.

## The claim this withdraws

Ticket 27's `## Comments`:

> The local dev server never binds on this machine — no output, no port, before the change as after

**That is wrong now.** Whether it was wrong on 2026-09-25 is not established and should not be
asserted: only today's state was measured, the machine has changed in eight days, and the original
entry records a repro "through the preview harness", which today's reading **confirms** rather than
contradicts. What is established is that the claim cannot be carried forward unqualified.

## Three ways to measure this wrongly, two of them demonstrated today

These are recorded because the investigation hit all three, not because any is proven to be what
happened on 2026-09-25.

1. **Piping into a consumer that exits.** `npx vite … | head -20` produced no output in 30 seconds
   and read as a hang. The same binary, run with stdout redirected to a file, reported `ready in
   479ms`. The difference is not established to be stdout buffering — a file redirect is not a TTY
   either, so full buffering would have silenced that run too. `head` exiting and closing the pipe is
   the better candidate. **The conservative statement is the useful one: a piped observation of this
   server is not evidence about the server.**
2. **Probing the IPv4 literal.** Bare `vite` listened on `[::1]:5201` and nothing else, so
   `curl 127.0.0.1:5201` was refused while the server was serving. **This does not explain the
   original report**, which concerned `npm run dev`, and that binds `0.0.0.0` and `[::]` both. It
   explains one wrong turn in today's bisect, and it will catch the next person who bisects with bare
   `vite`.
3. **Giving up during dependency optimization.** A run after a dependency or config change logs
   `Re-optimizing dependencies because vite config has changed` and takes appreciably longer to bind.
   A probe with a short timeout reads that as a hang.

## ~~The part that is a real failure and is still open~~ — diagnosed 2026-10-03

**The cause is the child's `process.stdin`, and the remedy is one redirection.** Read the second
`## Comments` entry for the measurements; this section is kept as the description of the symptom,
and two of its sentences are now wrong and are struck there rather than deleted.

**Under the Claude Code preview harness the server genuinely does not bind.** Reproduced twice on
2026-10-03: the process starts, npm echoes the command, and nothing follows — not even the
`[OAuth] Initialized` line that `createSpellCodeApp` emits well before any port work. No listener
appeared across a sixty-second retry window. The identical command from a shell with output
redirected reached `Server running on` in seconds.

This is a harness interaction rather than a fault in this project, and it is why the ticket is not
closed: **an agent reaching for a preview tool will still see a dead server and may re-reach the old
conclusion.** The cause is not diagnosed. The cheap remedy was a line in `AGENTS.md` naming the
invocation that works — **done**, see item 2 under "What to do". The thorough one is finding why
`tsx watch` stalls under that launcher, and that is all box 3 has left in it.

**The stall has since been narrowed, though not diagnosed** — see the 2026-10-03 entry under
`## Comments`, which measures a stalled launcher side by side with a working one. It locates the
failure upstream of anything in this repo: the `tsx` CLI starts normally and then never spawns the
server process at all.

`server/_core/**` is not implicated and must not be edited for this — it is vendored scaffold a
regeneration clobbers.

## Why this was worth a ticket

The false belief was load-bearing. It is cited as the reason three separate things could not be
proved: ticket 27's hour boundary against the real Supabase project, ticket 27's three unpinned
`onError` handlers, and stage 7's success path. Only the first of those is actually unblocked by
this — the handlers need a renderer and a widened `vitest.config.ts`, which is a declined decision
untouched here, and stage 7 additionally needs a third test Learner.

**A wrong "cannot" is more expensive than a wrong "can", because nobody re-tests it.** Ticket 31
reached the neighbouring conclusion about instruments one day earlier; the two belong together.

## What to do

1. ~~**Correct ticket 27 and the handoff.**~~ Done in this change: ticket 27's `## Comments` and its
   `**Status:**` block, the handoff's dev-server section, its "what is left" item 7, and its
   `diagnosing-bugs` suggestion.
2. ~~**Record the working invocation where an agent reads before trying**, which means `AGENTS.md`
   rather than only the handoff.~~ Done: `AGENTS.md` now carries a `## Running the dev server`
   section with the invocation, all three mismeasurements, and the preview-harness warning.
3. **Diagnose the harness failure, or decide it is not worth diagnosing** and leave the `AGENTS.md`
   line as the whole remedy. Either is a legitimate close; silently leaving it is not.
4. **Do not read this as unblocking stage 7.** A local server is a precondition, not the proof.

## Done when

- [x] Ticket 27 and the handoff no longer assert the dev server cannot start.
- [x] `AGENTS.md` carries the working invocation and the three mismeasurements above.
- [x] The harness failure is diagnosed, or recorded as deliberately not diagnosed. **Diagnosed**,
      not waived: `process.stdin` in the watch child, fixed by `< NUL`, proved by mutation.

## Related

- **Ticket 27**, whose `## Comments` is the origin of the claim and whose hour-boundary proof this
  unblocks.
- **Ticket 31**, for the instrument lesson this repeats from the other side: there a positive reading
  was trusted past what it measured, here a negative one was.
- **Ticket 22**, the Manus runtime injection. `vite.config.ts`'s `manus-debug-collector` is live in
  dev and writes to `.manus-logs/`. Not implicated — the server starts with it loaded — but it is
  what the browser console shows on every page load.

## Comments

### 2026-10-03 — the stalled launcher, measured beside a working one

The harness process from this ticket's own investigation was **still alive 55 minutes after it was
launched**, and was found by accident while stopping the working dev server. Both chains were on the
machine at once, so they could be compared directly rather than from memory of two separate runs.

| Started | Chain | Outcome |
|---|---|---|
| 14:15:14 | `npm run dev` → `cross-env` → **`tsx` CLI** | **no child process, no listener**, still stalled at 15:10 |
| 14:19:14 | `npm run dev` → `cross-env` → `tsx` CLI → `node server/_core/index.ts` | listening on `:3000`, answered `200` |

Measured on the two `tsx` CLI processes, the stalled one first:

```
CPU(s)=0.8    Threads=13  WS=40.6MB  Handles=267   no children
CPU(s)=0.86   Threads=13  WS=45.9MB  Handles=277   one child, serving
```

**What this establishes.** Three things, none of them previously known:

1. **The failure is upstream of this repo's code.** The stalled launcher never spawned a child at
   all, so nothing in `server/` — including `createSpellCodeApp`, whose missing `[OAuth] Initialized`
   line was the original symptom — ever began to run. This ticket's body already said the stall
   precedes that line; what is new is that it precedes the *process*.
2. **It is blocked, not spinning.** 0.8 CPU-seconds across 55 minutes. That rules out the slow-start
   explanations this ticket records as mismeasurement candidates — a long compile, or
   `Re-optimizing dependencies` — because either would burn CPU. It points instead at a wait on a
   handle: stdio, a pipe, or a file watcher.
3. **It is not port contention.** The working chain bound `:3000` four minutes later while the
   stalled one was still sitting there, and the stalled one held no listener on any port. "Address
   already in use" is not the mechanism.

The near-identical thread count, working set and handle count are the reason this is a narrowing
rather than a diagnosis: the stalled launcher got as far as the working one does before diverging, so
the difference is in what it is waiting on, not in how far it got.

The launcher that blocks is `tsx watch` itself — `package.json`'s `dev` script is
`cross-env NODE_ENV=development tsx watch server/_core/index.ts`, and the process observed is its own
`tsx/dist/cli.mjs`. So the thing that never forked is the **watch supervisor**, whose job is to spawn
the child and watch the tree. That makes a file watcher the first thing to suspect rather than one
candidate among three: on this machine the project sits under `C:\Users\…\Desktop`, and a watcher
that cannot establish its handles under the harness would block exactly here, before the first fork.

**What is not established.** The cause. Also: this is one observation of one stalled process, and
**both processes were terminated when the dev server was stopped, so this specimen no longer
exists.** Reproducing it means running a preview tool against this project again, which is cheap.
`Done when` box 3 stays unticked —
narrowing a cause is not diagnosing it, and this ticket's own standard is that an explicit decision
not to diagnose is also a legitimate close.

### 2026-10-03 — the child blocks on `process.stdin`, and one redirection fixes it

Diagnosed at `154c94b` under `/diagnosing-bugs`. **The entry above is wrong in its first and most
load-bearing claim**, and the correction is the reason the cause was findable.

#### The loop

`preview_start {name: "dev"}`, then assert on the port rather than on what the tool says:

```
netstat -ano | grep -cE ':3000\s+.*LISTENING'   →  0
curl --max-time 2 http://localhost:3000/        →  000
```

Held at `0` and `000` for 100 seconds across ten polls, while the harness's own result read
**"Server started successfully on port 3000"**. That disagreement is the bug in one line: **the
harness reports the launch, not the listener.**

#### ~~The stalled launcher never spawned a child at all~~ — it did

The fresh specimen's full chain, read from `Win32_Process`:

| PID | Process |
|---|---|
| 11928 | `cmd /C npm.cmd run dev` |
| 33316 | `npm-cli.js run dev` |
| 28056 | `cmd /c cross-env NODE_ENV=development tsx watch …` |
| 26932 | `cross-env.js` |
| 5436 | `cmd /c tsx "watch" "server/_core/index.ts"` |
| 28728 | `tsx/dist/cli.mjs watch server/_core/index.ts` ← the supervisor |
| **31248** | **`node --require …/tsx/dist/preflight.cjs --import …/loader.mjs server/_core/index.ts`** ← **the child** |

**The child exists.** So the previous entry's three conclusions need splitting: "blocked, not
spinning" holds (0 CPU-seconds across 8 seconds, measured twice), "not port contention" holds, and
**"the failure is upstream of this repo's code because nothing was ever spawned" does not.** It was
inferred from one `ParentProcessId` reading of a 55-minute-old process, and the mechanism it proposed
— a file watcher blocking before the first fork — was wrong. **A narrowing that names a mechanism is
a hypothesis, and this one was recorded in a table.**

The child had **2.3 CPU-seconds and a 111MB working set** before stopping dead, so it had loaded a
great deal of this application. The old entry's "nothing in `server/` ever began to run" is wrong in
the same way.

#### Four hypotheses, three killed by probe

Each probe was a `launch.json` entry, so every one ran under the **same** harness. The repo was not
touched.

| Hypothesis | Probe | Result |
|---|---|---|
| The harness cannot start a listener at all | a 12-line script that binds `:3000` and prints nothing first | **binds, 200** — killed |
| A stdout write blocks before `listen()` | the same script writing 327,720 bytes to stdout first, tracing each chunk to a **file** | every write returned, then it bound — **killed** |
| `tsx watch` is broken under the harness | `tsx watch` on that same minimal script | **binds, 200** — killed |
| `tsx watch` + this app's module graph | `npm run dev` with a tracer injected by `NODE_OPTIONS=--require` | **stalls** |

The third row is the one that matters: `npx tsx server/_core/index.ts` — the same entry file, same
harness, **no `watch`** — bound in under 5 seconds. So `watch` is load-bearing and the app is
load-bearing, and neither alone is enough.

#### The instrument that found it

A `--require` tracer writing to a **per-pid file**, never to stdout, because stdout was a suspect.
It classifies nothing and does one thing well: it touches `process.stdout`, `process.stderr` and
`process.stdin` **separately**, logging before and after each, then starts a 500ms heartbeat.

**The heartbeat is the whole instrument.** A heartbeat that keeps ticking while nothing happens means
the event loop is alive and something is awaiting. A heartbeat that never appears means the process is
blocked synchronously. The app child's trace, in full, is five lines and then silence:

```
start pid=24380 ppid=23152
argv=…\node.exe …\server\_core\index.ts
about to touch process.stdout
touched process.stdout isTTY=undefined
about to touch process.stderr
touched process.stderr isTTY=undefined
about to touch process.stdin          ← last line ever written
```

No heartbeat, no exit, no further line. **Constructing `process.stdin` never returns.** The same
tracer in the supervisor (`tsx/dist/cli.mjs`, pid 23152) and in `cross-env` (pid 20856) got through
all three streams in under 60ms each and heartbeated for the rest of the run — so the handle the
**supervisor** was given is fine and the handle it hands its **child** is not.

#### The fix, proved by mutation

One variable changed, nothing else — stdin redirected from `NUL`:

```
cmd /c "npm run dev < NUL"
```

Under the identical harness, the same chain, the same app:

```
t=6s   listeners=2   http=200
t=48s  listeners=2   http=200
```

and the harness log now carries what the shell always did:

```
[OAuth] Initialized with baseURL:
Server running on http://localhost:3000/
```

`/api/version` answered `{"commit":null,…,"startedAt":"2026-10-03T14:42:48.191Z"}`, `/` served 879
bytes of `text/html`, and **the application rendered in the preview pane** — banner, primary
navigation, the hero, `[vite] connected` in the console and no application error. That is the first
time a preview tool has rendered this project.

**`.claude/launch.json`'s `dev` entry now carries the redirection**, so `preview_start {name: "dev"}`
works as an agent would expect it to. The old spawn is kept beside it as `dev-inherited-stdin`, which
is the reproducer. That file is **gitignored** (`.gitignore:118`), so **this fix does not travel** —
which is why the mechanism is written out here and in `AGENTS.md` rather than only configured.

#### What is still not established, stated precisely

- **Which line touches `process.stdin`.** Nothing in `server/` needs it. The untraced child reached
  2.3 CPU-seconds first, so the touch happens somewhere in the module graph — vite, a dependency of
  it, or Node's own bootstrap — and the tracer front-loaded the same block to the first line instead
  of hunting it. `< NUL` makes the question moot; a `tsx` upgrade could make it live again.
- **Why that handle blocks.** `tsx watch` spawns its child with stdio of its own making
  (`dist/client-*.cjs` also opens a named pipe at `getPipePath(process.ppid)` for dependency
  reporting). Whether the blocking handle is that pipe, or the inherited harness stdin passed through
  six intermediate processes, is not measured. The mutation proof says stdin is load-bearing; it does
  not say which stdin.
- **Whether this is tsx's bug or the harness's.** Both are plausible and neither is established. It
  is reportable upstream as "tsx 4.20.6 watch child blocks on `process.stdin` when stdin is a
  non-draining pipe" **only after** someone reproduces it without this application.

#### No regression test exists, and that is the finding

There is no seam. The failure needs a preview harness spawning a process tree six deep; `vitest`
covers `server/**` only, and a test that spawned `tsx watch` would be asserting on the harness's
stdio, which it cannot create. **Per `/diagnosing-bugs`, an absent seam is itself the result**: this
bug is locked down by a `launch.json` entry and two paragraphs, not by a test, and it can regress
silently on a `tsx` upgrade. The cheap detector is the loop at the top of this entry — one
`preview_start`, one `netstat`.

No secrets appear in this file.
