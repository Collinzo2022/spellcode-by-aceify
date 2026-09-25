import { describe, expect, it } from "vitest";
import { REFRESH_LEEWAY_SECONDS, decideSessionUse, parseStoredSession, type SupabaseSession } from "../shared/supabaseSession";

/**
 * A Learner's stored session, and what to do with it right now.
 *
 * This is the pure half of ticket 27: before the fix the client read "a string
 * exists" as "signed in", so an hour-old token was sent on every request and
 * refused on every request. The decision is the whole defect, so it lives in one
 * testable place rather than inline at each reader.
 */

const nowMs = Date.UTC(2026, 8, 25, 12, 0, 0);
const at = (secondsFromNow: number) => nowMs / 1000 + secondsFromNow;

const session = (overrides: Partial<SupabaseSession> = {}): string =>
  JSON.stringify({ access_token: "access-abc", refresh_token: "refresh-xyz", expires_at: at(3600), user: { id: "learner-1" }, ...overrides } satisfies SupabaseSession);

describe("deciding what to do with a Learner's stored session", () => {
  it("uses a token that is still well inside its life", () => {
    expect(decideSessionUse(session(), nowMs)).toEqual({ action: "use", accessToken: "access-abc" });
  });

  it("refreshes an expired token instead of sending it", () => {
    expect(decideSessionUse(session({ expires_at: at(-1) }), nowMs)).toEqual({ action: "refresh", refreshToken: "refresh-xyz" });
  });

  it("refreshes inside the leeway, before the token is actually dead", () => {
    // A request that leaves now with a token expiring in seconds arrives expired.
    expect(decideSessionUse(session({ expires_at: at(REFRESH_LEEWAY_SECONDS - 1) }), nowMs)).toEqual({ action: "refresh", refreshToken: "refresh-xyz" });
    expect(decideSessionUse(session({ expires_at: at(REFRESH_LEEWAY_SECONDS + 1) }), nowMs)).toEqual({ action: "use", accessToken: "access-abc" });
  });

  it("reads expires_at as Supabase sends it, in seconds", () => {
    // Read as milliseconds this lands in 1970 and every live session looks dead.
    expect(decideSessionUse(session({ expires_at: at(1800) }), nowMs)).toEqual({ action: "use", accessToken: "access-abc" });
  });

  it("refreshes a session stored without an expiry rather than trusting it forever", () => {
    // The shape the pre-fix client persisted. Trusting it is the defect itself.
    expect(decideSessionUse(session({ expires_at: undefined }), nowMs)).toEqual({ action: "refresh", refreshToken: "refresh-xyz" });
  });

  it("asks for a sign-in when there is nothing usable stored", () => {
    expect(decideSessionUse(null, nowMs)).toEqual({ action: "sign-in" });
    expect(decideSessionUse(undefined, nowMs)).toEqual({ action: "sign-in" });
    expect(decideSessionUse("", nowMs)).toEqual({ action: "sign-in" });
    expect(decideSessionUse("not json", nowMs)).toEqual({ action: "sign-in" });
    expect(decideSessionUse("null", nowMs)).toEqual({ action: "sign-in" });
    expect(decideSessionUse(JSON.stringify({ user: { id: "learner-1" } }), nowMs)).toEqual({ action: "sign-in" });
    expect(decideSessionUse(session({ access_token: "" }), nowMs)).toEqual({ action: "sign-in" });
  });

  it("asks for a sign-in when an expired session has no refresh token", () => {
    expect(decideSessionUse(session({ expires_at: at(-1), refresh_token: undefined }), nowMs)).toEqual({ action: "sign-in" });
    expect(decideSessionUse(session({ expires_at: at(-1), refresh_token: "" }), nowMs)).toEqual({ action: "sign-in" });
  });

  it("reads a stored session back, and refuses one it cannot trust", () => {
    expect(parseStoredSession(session())?.user.id).toBe("learner-1");
    expect(parseStoredSession("not json")).toBeNull();
    expect(parseStoredSession(JSON.stringify(["access-abc"]))).toBeNull();
  });
});
