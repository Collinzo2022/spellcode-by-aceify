# 37: the dev server starts, except under an automated harness

**Status:** open, `ready-for-agent`. Found 2026-10-03 while looking for what blocks ticket 27's
browser proof. **Most of this is a correction rather than a defect**: three documents record a dev
server that cannot start, and `npm run dev` starts. One part is a real failure and is still open —
under an automated preview harness it does not bind.

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

## The part that is a real failure and is still open

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
- [ ] The harness failure is diagnosed, or recorded as deliberately not diagnosed.

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

No secrets appear in this file.
