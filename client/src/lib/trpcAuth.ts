import { UNAUTHED_ERR_MSG } from "@shared/const";
import { currentUtcOffsetHeader } from "@shared/utcOffset";
import { TRPCClientError } from "@trpc/client";
import { getFreshSupabaseAccessToken, hasSupabaseSession, markAccessTokenRejected } from "./supabaseAuth";

/**
 * What every tRPC request carries, and what to do when one comes back refused.
 *
 * Both halves live here rather than inline in `main.tsx` so they can be tested:
 * `main.tsx` mounts React and cannot be imported under a `server/**` test, and
 * ticket 27 is a defect that hid in exactly this wiring. Removing the `await`
 * below is enough to bring the whole bug back, so it is a line that needs a test
 * standing on it.
 */

/**
 * The headers for one request, with the session refreshed if the token is spent.
 *
 * Read per request, not once at startup, so a session open across a daylight
 * saving change or a flight corrects itself — and so an hour-old token is renewed
 * here rather than sent and refused.
 */
export async function requestHeaders(): Promise<Record<string, string>> {
  const token = await getFreshSupabaseAccessToken();
  return { ...currentUtcOffsetHeader(), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/**
 * What the app should do about an error the server returned.
 *
 * - `ignored`: not an authentication problem, so it is the caller's to report.
 * - `refresh-next`: the server refused a session the client still holds. The
 *   token is marked spent, so the next request renews it. **No redirect** — the
 *   Learner keeps their page, which is the whole point of ticket 27. A refresh the
 *   network ate lands here too, and recovers on its own once the network returns.
 * - `sign-in`: there is no session left to renew. Only now is a sign-in honest.
 */
export type UnauthorizedOutcome = "ignored" | "refresh-next" | "sign-in";

export function classifyRequestError(error: unknown): UnauthorizedOutcome {
  if (!(error instanceof TRPCClientError)) return "ignored";
  if (error.message !== UNAUTHED_ERR_MSG) return "ignored";
  if (!hasSupabaseSession()) return "sign-in";
  markAccessTokenRejected();
  return "refresh-next";
}
