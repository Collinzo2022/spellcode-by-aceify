import { CONFIG_STORAGE_KEY, SESSION_STORAGE_KEY, decideSessionUse, parseStoredConfig, parseStoredSession, sessionToStore, type SessionUse, type SupabasePublicConfig, type SupabaseTokenResponse } from "@shared/supabaseSession";

type SupabaseErrorBody = { error_description?: string; msg?: string; code?: string };

export class SupabaseAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "SupabaseAuthError";
  }
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** What to do with the stored session at this moment. One read, one clock. */
function currentDecision(): SessionUse {
  return decideSessionUse(readStored(SESSION_STORAGE_KEY), Date.now());
}

/**
 * Whether a Learner still has a session, refreshable or not.
 *
 * Deliberately not "is there a live token": between expiry and the next refresh
 * the Learner is still signed in, and reporting otherwise would throw them out of
 * the app on the hour, every hour (ticket 27).
 */
export function hasSupabaseSession(): boolean {
  return currentDecision().action !== "sign-in";
}

export function clearSupabaseSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(CONFIG_STORAGE_KEY);
  } catch {}
}

/** Store a token response, or clear the session if it cannot be managed. */
function persistTokenResponse(body: SupabaseTokenResponse): string | null {
  const session = sessionToStore(body, Date.now());
  if (!session) {
    clearSupabaseSession();
    return null;
  }
  writeStored(SESSION_STORAGE_KEY, session);
  return session.access_token;
}

/**
 * The one refresh in flight, shared by every caller that wants it.
 *
 * Supabase rotates the refresh token on use, so the second of two concurrent
 * refreshes would present a spent token, be refused, and clear the session that
 * the first one had just renewed. tRPC batches several queries on page load,
 * which is precisely when a session is most likely to be stale, so this is a
 * race the app would run into daily rather than a theoretical one.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refresh(refreshToken: string): Promise<string | null> {
  const config = parseStoredConfig(readStored(CONFIG_STORAGE_KEY));

  // No config means this session predates it being stored. It cannot be
  // refreshed, and keeping it would be the old zombie session again.
  if (!config) {
    clearSupabaseSession();
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    // The network failed, not the session. Keep it: the Learner is offline for a
    // moment, and throwing the session away would make that a sign-out.
    return null;
  }

  if (!response.ok) {
    clearSupabaseSession();
    return null;
  }

  return persistTokenResponse((await response.json()) as SupabaseTokenResponse);
}

/**
 * The token to send, refreshing first if the stored one is spent.
 *
 * Resolves to null only when there is nothing to send — no session, one Supabase
 * refused to renew, or a refresh the network ate. A null is not a verdict on
 * whether the Learner is signed in; `hasSupabaseSession` answers that.
 */
export function getFreshSupabaseAccessToken(): Promise<string | null> {
  const decision = currentDecision();
  if (decision.action === "use") return Promise.resolve(decision.accessToken);
  if (decision.action === "sign-in") return Promise.resolve(null);

  refreshInFlight ??= refresh(decision.refreshToken).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * The last token the server refused, so one rejection is not chased forever.
 *
 * Without it, a server that refuses even a freshly minted token would have the
 * client refresh once per request for as long as the Learner kept clicking.
 */
let lastRejectedAccessToken: string | null = null;

/**
 * Record that the server refused the stored token, so the next request refreshes.
 *
 * The expiry is the only thing deciding whether a token is sent, so a token the
 * server rejected early — a clock further out than the leeway, a session revoked
 * from the dashboard — is marked spent by moving its expiry into the past. This is
 * ticket 27's "or on a 401" half, and it recovers the session instead of sending
 * the Learner to a sign-in page they do not need.
 */
export function markAccessTokenRejected(): boolean {
  const session = parseStoredSession(readStored(SESSION_STORAGE_KEY));
  if (!session) return false;
  if (session.access_token === lastRejectedAccessToken) return false;
  lastRejectedAccessToken = session.access_token;
  writeStored(SESSION_STORAGE_KEY, { ...session, expires_at: 0 });
  return true;
}

async function callSupabase(config: SupabasePublicConfig, path: string, payload: Record<string, unknown>) {
  const response = await fetch(`${config.url}${path}`, {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as SupabaseTokenResponse & SupabaseErrorBody;

  if (!response.ok) {
    throw new SupabaseAuthError(body.error_description ?? body.msg ?? "Unable to authenticate.", response.status, body.code);
  }

  // A signup awaiting email confirmation carries no token and is not a session.
  // The config is written down with the session, not before it: a refresh runs
  // outside React and cannot ask the `auth.supabaseConfig` query for it.
  if (body.access_token) {
    writeStored(CONFIG_STORAGE_KEY, { url: config.url, anonKey: config.anonKey });
    persistTokenResponse(body);
  }
  return body;
}

export function signInWithPassword(config: SupabasePublicConfig, email: string, password: string) {
  return callSupabase(config, "/auth/v1/token?grant_type=password", { email, password });
}

export function signUpWithPassword(config: SupabasePublicConfig, email: string, password: string, displayName: string) {
  const emailRedirectTo = typeof window === "undefined" ? undefined : `${window.location.origin}/auth/confirmed`;
  return callSupabase(config, "/auth/v1/signup", { email, password, data: { display_name: displayName }, options: { emailRedirectTo } });
}
