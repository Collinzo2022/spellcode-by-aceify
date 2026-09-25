# 02: Introduce learnerId at the framework boundary

**What to build:** Nothing changes for a Learner. Our code stops referring to a Learner by a name
that describes a system we no longer use.

The identifier is currently called `openId` throughout our server code. It holds a Supabase UUID.
The name is a leftover from a retired OAuth provider, and it sends anyone reading the code looking
for an identity path that no longer exists.

Rename it to `learnerId` across our code: routers, the mobile handler, the Supabase helpers and all
test fixtures.

**Do not rename it inside the vendored scaffold.** The name originates in the framework core, where
it genuinely is that SDK's own session-token field and part of its contract. That directory is
generated template code and changes to it would be lost on regeneration. Instead, map the
framework's field to `learnerId` once at the boundary where our code takes over, and use `learnerId`
everywhere from that point inward.

**Blocked by:** None (can start immediately).

**Status:** done (30551b6)

- [x] A single adapter maps the framework's session identifier to `learnerId` at the boundary.
- [x] No file outside the vendored scaffold refers to `openId` — except the boundary module
      itself (`server/learner.ts`), which is where the scaffold contract is deliberately
      confined, and the scaffold-owned `auth.logout.test.ts`. Renaming the field outright is
      impossible without editing `server/_core` (TS2352) and would break scaffold regeneration.
- [x] No file inside the vendored scaffold is modified.
- [x] Routers, the mobile handler, Supabase helpers and test fixtures all use `learnerId`.
- [x] Behaviour is unchanged: the same Supabase UUID reaches the same queries as before.
- [x] Type checking passes and the full test suite passes.
