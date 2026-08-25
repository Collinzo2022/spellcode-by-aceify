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
 * Profile writes that carry a new XP total.
 *
 * Matched on the presence of the `xp` key rather than on the path, because what
 * the ticket forbids is any *other* code patching the total - and such a patch
 * goes to the same profile row by the same URL. Only the body tells them apart.
 */
export function xpPatches(stub: Stub) {
  return stub.writesTo("profiles").filter(write => write.method === "PATCH" && Object.prototype.hasOwnProperty.call(write.body ?? {}, "xp"));
}
