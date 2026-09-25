/**
 * The Learner's stored Supabase session, and what to do with it right now.
 *
 * One contract in one place, for the same reason as `utcOffset.ts`: the code
 * that persists a session, the code that reads a token out of it, and the code
 * that decides it is too old to send must agree, and they are in three different
 * files. Before ticket 27 they did not agree at all — a stored string was read
 * as proof of a signed-in Learner, so an expired token was sent on every request
 * and refused on every request, silently, for the rest of the browser session.
 *
 * The decision is deliberately pure and takes the clock as an argument, so the
 * hour boundary that caused the defect is a value a test can sit on either side
 * of rather than something to wait out.
 */

/** Where the browser keeps the session. Named in ticket 27's workaround. */
export const SESSION_STORAGE_KEY = "spellcode-supabase-session";

/**
 * Where the browser keeps the public Supabase config the refresh needs.
 *
 * A refresh happens outside React, in the tRPC header callback, so it cannot
 * wait on the `auth.supabaseConfig` query the sign-in pages use. Both values are
 * public — they are already shipped to every visitor — so the sign-in that has
 * them writes them down for the refresh that does not.
 */
export const CONFIG_STORAGE_KEY = "spellcode-supabase-config";

/**
 * How early a token is treated as spent.
 *
 * A request that leaves with one second of life left arrives expired, and a
 * clock a minute fast expires it sooner than this client thinks. Refreshing
 * early costs one extra call an hour; refreshing late costs the Learner their
 * session.
 */
export const REFRESH_LEEWAY_SECONDS = 60;

/** A Supabase token response, as it is stored. `expires_at` is Unix **seconds**. */
export type SupabaseSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: { id: string; email?: string };
};

/** What Supabase answers a sign-in or a refresh with. It sends both expiry forms. */
export type SupabaseTokenResponse = SupabaseSession & { expires_in?: number };

/** The public half of a Supabase project, enough to ask it for a new token. */
export type SupabasePublicConfig = { url: string; anonKey: string };

/**
 * What a caller holding the stored session should do.
 *
 * Three outcomes, not two: "expired" is not the same as "signed out", and
 * collapsing them is what would log a Learner out every hour on the hour.
 */
export type SessionUse =
  | { action: "use"; accessToken: string }
  | { action: "refresh"; refreshToken: string }
  | { action: "sign-in" };

/**
 * A stored session, or null if what is there cannot be trusted.
 *
 * A session without an access token is not a session. Neither is a JSON array,
 * or anything else that survived `JSON.parse` without being an object.
 */
export function parseStoredSession(raw: string | null | undefined): SupabaseSession | null {
  const session = parseJsonObject<SupabaseSession>(raw);
  if (!session) return null;
  if (typeof session.access_token !== "string" || session.access_token === "") return null;
  return session as SupabaseSession;
}

/** The public config, or null if none was stored beside the session. */
export function parseStoredConfig(raw: string | null | undefined): SupabasePublicConfig | null {
  const config = parseJsonObject<SupabasePublicConfig>(raw);
  if (!config) return null;
  if (typeof config.url !== "string" || config.url === "") return null;
  if (typeof config.anonKey !== "string" || config.anonKey === "") return null;
  return { url: config.url, anonKey: config.anonKey };
}

/** A JSON object off storage, or null for anything that is not one. */
function parseJsonObject<T>(raw: string | null | undefined): Partial<T> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  return parsed as Partial<T>;
}

/**
 * What to write down from a token response, or null if it cannot be managed.
 *
 * Supabase sends the expiry twice — `expires_at` as an absolute and `expires_in`
 * as a duration — and this stores an absolute either way. A session with neither
 * has no knowable life, and storing one would make every single request refresh
 * it forever, so it is refused outright rather than kept and re-refreshed.
 *
 * Only the four fields the client actually reads are kept, so the stored shape is
 * this module's own rather than whatever Supabase last happened to send.
 */
export function sessionToStore(body: SupabaseTokenResponse, nowMs: number): SupabaseSession | null {
  if (typeof body.access_token !== "string" || body.access_token === "") return null;
  const expiresAt = Number.isFinite(body.expires_at)
    ? (body.expires_at as number)
    : Number.isFinite(body.expires_in)
      ? Math.floor(nowMs / 1000) + (body.expires_in as number)
      : null;
  if (expiresAt === null) return null;
  return { access_token: body.access_token, refresh_token: body.refresh_token, expires_at: expiresAt, user: body.user };
}

/**
 * Whether a token is still worth sending, given when it expires.
 *
 * An absent or unreadable `expires_at` is *not* fresh. Supabase always sends
 * one, so a session missing it was stored by a client that discarded it — the
 * pre-ticket-27 client — and the only safe reading of "expiry unknown" is that
 * the expiry has passed. It is refreshable, which is what makes that safe.
 */
function isFresh(expiresAtSeconds: number | undefined, nowMs: number): boolean {
  if (typeof expiresAtSeconds !== "number" || !Number.isFinite(expiresAtSeconds)) return false;
  return (expiresAtSeconds - REFRESH_LEEWAY_SECONDS) * 1000 > nowMs;
}

/**
 * What to do with the stored session at `nowMs`.
 *
 * Every reader goes through here, so there is one answer rather than one per
 * caller. `nowMs` is milliseconds, because that is what `Date.now()` returns;
 * `expires_at` is seconds, because that is what Supabase sends.
 */
export function decideSessionUse(raw: string | null | undefined, nowMs: number): SessionUse {
  const session = parseStoredSession(raw);
  if (!session) return { action: "sign-in" };
  if (isFresh(session.expires_at, nowMs)) return { action: "use", accessToken: session.access_token };
  const refreshToken = typeof session.refresh_token === "string" && session.refresh_token !== "" ? session.refresh_token : null;
  return refreshToken ? { action: "refresh", refreshToken } : { action: "sign-in" };
}
