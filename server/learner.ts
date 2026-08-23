/**
 * The boundary between the vendored scaffold and SpellCode's own code.
 *
 * `CONTEXT.md` calls a learner's identifier the **Learner ID**, and says it is
 * "never called `openId`; that name is a retired artifact of a former OAuth
 * provider and refers to nothing in the current system". The value carried here
 * is the Supabase UUID and nothing else.
 *
 * The session type below still carries that retired name, because the scaffold
 * in `server/_core` consumes it: `context.ts` imports it and `sdk.ts`
 * constructs one. That directory is generated template code, so a regenerated
 * scaffold will again expect a field called `openId` — renaming it here would
 * turn the next regeneration into a broken build for reasons nobody could see.
 *
 * So the retired name is confined to this file. Construct session users with
 * `makeSessionUser` and read the identifier with `learnerIdOf`; everything
 * inward speaks only of a Learner ID.
 */

export type AppUser = {
  id: string;
  /** Retired name for the Learner ID. Kept only for the scaffold's contract. */
  openId: string;
  name: string;
  email: string | null;
  loginMethod: "supabase";
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

export type SessionUser = {
  learnerId: string;
  name: string;
  email: string | null;
  role: "user" | "admin";
  at?: Date;
};

/** Build the scaffold's session type from a Learner ID. */
export function makeSessionUser(user: SessionUser): AppUser {
  const at = user.at ?? new Date();
  return {
    id: user.learnerId,
    openId: user.learnerId,
    name: user.name,
    email: user.email,
    loginMethod: "supabase",
    role: user.role,
    createdAt: at,
    updatedAt: at,
    lastSignedIn: at,
  };
}

/** The Learner ID of an authenticated session. */
export function learnerIdOf(user: Pick<AppUser, "openId">): string {
  return user.openId;
}
