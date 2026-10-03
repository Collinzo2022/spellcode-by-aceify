# 22: The Manus runtime is 99.8% of every HTML document served

**Status:** done and committed as `5753e04`, **pushed** — it is an ancestor of `origin/main`. Five of
six boxes ticked; the deployed-session check is the exception and is called out below.

**This line read "done in the working tree, not committed" until 2026-10-03**, nine days after
`5753e04` landed. `docs/agents/issue-tracker.md` makes a ticket's `Status:` line the authority on
whether it is done, so a stale one is not a cosmetic defect: it is the authority disagreeing with
git. The commit is findable as `git log --oneline --grep 'ticket 22'`, which is the check that should
have been run before writing a "not committed" into a file nobody re-reads.

Found while verifying the ticket-21-adjacent analytics fix
(`d3a3d0b`); deliberately not folded into it, because that was a scaffold deletion and this is a
build-config change with an auth question attached.

**What to build:** drop `vite-plugin-manus-runtime` from the production build, and delete the two
client touchpoints that exist only to feed it.

## The measurement

`vite.config.ts:153` lists `vitePluginManusRuntime()` in the plugin array unconditionally. The
plugin (`node_modules/vite-plugin-manus-runtime/dist/index.js`) has **no production branch**: its
`transformIndexHtml` inlines the whole of `runtime_dist/manus-runtime.js` into every build, and
uses `ctx.server !== undefined` only to set a flag, not to decide whether to inject.

| | bytes |
|---|---|
| `runtime_dist/manus-runtime.js` inlined | 367,081 |
| HTML served by both hosts | 367,773 |
| **The application's own HTML** | **~700** |

So **99.8% of the document is the runtime.** Measured on both hosts after `d3a3d0b`:

```
vercel: 367773 bytes
render: 367773 bytes
```

Three things make this worse than a 367 KB asset would be:

1. **It is `injectTo: 'body-prepend'`** — it lands before `<div id="root">`, so it parses and
   executes before the app mounts.
2. **It is in the HTML document, not a hashed asset.** `Cache-Control: public, max-age=0,
   must-revalidate` on `/`, so it is revalidated per navigation rather than cached the way
   `/assets/index-*.js` is. The 104,704 bytes it gzips to are paid again on every full page load.
3. **It is dead here.** The runtime is the Manus hosted-editor overlay — `@medv/finder`,
   `modern-screenshot`, its own React and a 34 KB stylesheet. Manus is gone; nothing on Vercel or
   Render is a Manus preview iframe.

For scale: `d3a3d0b` removed a 4-line tag that cost each visitor 368 KB. This costs the same again,
on the same page load, and has been doing so the entire time.

## The two touchpoints, and why neither blocks removal

This is the part to get right. Both are **legacy-Manus-preview only**, and Supabase auth supersedes
both — but they point in opposite directions, so they need different treatment.

**`client/src/_core/hooks/useAuth.ts:59` — a write with no reader.**

```ts
localStorage.setItem("manus-runtime-user-info", JSON.stringify(user));
```

The app never reads this key; the runtime does. It is also unconditional inside a `useMemo`, so the
whole user object is serialised into `localStorage` on every recompute. Removing the runtime makes
it dead code that still writes user data to disk. **Delete it with the plugin.**

**`client/src/main.tsx:50` — a read with no writer, once the runtime goes.**

```ts
const raw = sessionStorage.getItem("manus-cookie");
```

The runtime writes `manus-cookie`; this is the Preview auto-login fallback for when an iframe blocks
cookies (Safari ITP / WebView), per the comment at `main.tsx:45-48`. With the runtime gone nothing
ever writes the key, so the branch is unreachable. It is guarded and `try`/`catch`ed, so leaving it
is harmless — but it is a fallback for a platform that no longer exists, and
`authorizationHeader()` already returns the Supabase bearer token first at `main.tsx:43-44`.
**Delete it too**, and with it the `sessionStorage.removeItem("manus-cookie")` at `useAuth.ts:47`.

Supabase taking precedence is already pinned by a test:
`server/supabase-auth-precedence.test.ts:11`, *"uses a valid Supabase bearer token instead of a
simultaneous legacy OAuth cookie"*. That test is the reason this removal is safe to reason about
rather than guess at.

## Boxes

- [x] `vitePluginManusRuntime()` no longer runs for a production build. Prefer **removing it from
      `vite.config.ts:153` outright** over gating it on `NODE_ENV` — nothing here is a Manus host,
      so a gate keeps a dependency alive to serve an environment that cannot occur. Drop
      `vite-plugin-manus-runtime` from `package.json:101` in the same change.
- [x] `dist/public/index.html` after `npx vite build` contains no `<script id="manus-runtime">`, and
      is **under 2 KB**. State the measured number in the commit.
- [x] `useAuth.ts:59`, `useAuth.ts:47` and the `manus-cookie` branch at `main.tsx:49-58` are gone,
      and `authorizationHeader()` returns either the Supabase bearer token or no header.
- [x] `npx tsc --noEmit`, `npx vitest run` and `npx vite build` pass.
- [x] **Mutation-test the auth claim** rather than assuming it: before removing anything, confirm
      `server/supabase-auth-precedence.test.ts` fails when Supabase precedence is broken. If it
      cannot fail, it is not holding this removal up and the ticket needs a test that does.
- [ ] Sign in on the deployed site afterwards and load the dashboard. The suite covers the server;
      it does not cover a real browser session, which is exactly what these two touchpoints sit in.
      **Still open.** It cannot be done before this is deployed, and it needs a real credentialled
      sign-in. This is the one box that would catch a mistake the other five cannot.

## Watch out

- `vite.config.ts` also runs `vitePluginManusDebugCollector()` (`:153`), which is **local** code in
  this repo, not the package. It already returns `html` unchanged when
  `process.env.NODE_ENV === "production"` (`:81-83`), so it is not part of this ticket. Do not
  delete it by association — it is the `.manus-logs` dev collector.
- `jsxLocPlugin()` stays. It is what makes a local build's bundle hash differ from CI's (see
  handoff), but it is not this.
- `template.json` still holds the pre-alignment scaffold, including the analytics tag `d3a3d0b`
  removed. It is a template artifact, not a build input. Leave it.
- `server/` is untouched by this ticket. The runtime is client-side only.

**Blocked by:** nothing. Independent of switch stages 8, 10 and 11.

**Not verified:** what the runtime does at execution time when `window.__MANUS_HOST_DEV__` is
`false`. The flag appears exactly once in its 367 KB (`grep -c` = 1), which suggests it self-gates
early, so the *runtime cost* may be near zero even today. That would not change this ticket — the
bytes are shipped and parsed either way — but it does mean the win is transfer and parse time, not
CPU, and the commit should not claim otherwise.


## Result (2026-09-24)

| | before | after |
|---|---|---|
| `dist/public/index.html` | 367,792 B | **634 B** |
| `<script>` tags in it | 3 | 1 |
| `grep -c manus` in it | >0 | 0 |

The document is now the module entry, the stylesheet and `<div id="root">`. A 578x reduction.

`pnpm-lock.yaml` was regenerated with `pnpm install --lockfile-only` (26 lines removed). **This was
not optional:** Render's build command is `pnpm install && pnpm build`, and pnpm defaults to
`--frozen-lockfile` in CI, so a `package.json` without a matching lockfile fails the deploy rather
than degrading quietly.

Mutation test, run before any removal: inverting precedence in `authenticateRequest`
(`server/_core/sdk.ts:257`) so a legacy cookie is consulted first makes
`server/supabase-auth-precedence.test.ts` fail. `server/_core/**` is vendored, so the mutation was
reverted and the restore checked by md5, not by eye.

Gates: `tsc --noEmit` clean, `vitest run` 188 passed / 2 skipped / 0 failed, `vite build` green.
The bundle hash moved to `index-oRQGEuIQ.js`, as expected — `main.tsx` and `useAuth.ts` both changed.
