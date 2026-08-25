import type { createSupabaseStub } from "./supabaseStub";

type Stub = ReturnType<typeof createSupabaseStub>;

/**
 * The one path every XP award is written through (ADR 0002).
 *
 * Shared by the tests that drive it from the web routers and from the mobile
 * routes, so that a change to the path is a change in one place and cannot make
 * one of the two suites pass by describing the wrong write.
 */
export const XP_ENTRIES = /^\/rest\/v1\/xp_entries\?on_conflict=user_id,source_kind,source_id/;

/**
 * Every write that sets a Learner's cached XP total.
 *
 * Two shapes count. The legitimate one is the atomic recompute, which is a
 * database function rather than a PATCH: the total is rewritten from the ledger
 * inside a single statement, so no value this process read can be written back.
 * The other is any direct patch of the `xp` column, which is what ticket 08
 * abolished and what would reintroduce the lost-update race - matched on the
 * body rather than the path, because such a patch goes to the same profile row
 * by the same URL as the streak write beside it.
 */
export function xpWrites(stub: Stub) {
  const recomputes = stub.writesTo("rpc/recompute_learner_xp");
  const patches = stub.writesTo("profiles").filter(write => write.method === "PATCH" && Object.prototype.hasOwnProperty.call(write.body ?? {}, "xp"));
  return { recomputes, patches, total: recomputes.length + patches.length };
}
