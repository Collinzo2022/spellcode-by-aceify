import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_STORAGE_KEY, SESSION_STORAGE_KEY, parseStoredSession, type SupabaseSession } from "../shared/supabaseSession";
import { clearSupabaseSession, getFreshSupabaseAccessToken, hasSupabaseSession, signInWithPassword } from "../client/src/lib/supabaseAuth";

/**
 * The impure half of ticket 27: actually getting a new token.
 *
 * These tests live under `server/` because that is the only directory
 * `vitest.config.ts` collects (AGENTS.md), and they reach into `client/src`
 * rather than moving browser code out of it. The module under test imports
 * nothing but `@shared`, so a node environment with `localStorage` and `fetch`
 * stubbed is the real thing and not a stand-in.
 */

const config = { url: "https://project.supabase.co", anonKey: "anon-key" };

function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  store.set(CONFIG_STORAGE_KEY, JSON.stringify(config));
  return store;
}

const storedSession = (secondsUntilExpiry: number, accessToken = "access-old"): string =>
  JSON.stringify({ access_token: accessToken, refresh_token: "refresh-first", expires_at: Math.floor(Date.now() / 1000) + secondsUntilExpiry, user: { id: "learner-1" } } satisfies SupabaseSession);

/** What Supabase answers a refresh with: a new token *and* a new refresh token. */
const refreshedSession = (body: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ access_token: "access-new", refresh_token: "refresh-second", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "learner-1" }, ...body }), { status: 200, headers: { "Content-Type": "application/json" } });

const stored = (store: Map<string, string>) => parseStoredSession(store.get(SESSION_STORAGE_KEY));

let store: Map<string, string>;

describe("keeping a Learner's session alive", () => {
  beforeEach(() => {
    store = installLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes an expired session rather than sending a dead token", async () => {
    store.set(SESSION_STORAGE_KEY, storedSession(-60));
    const fetchMock = vi.fn().mockResolvedValue(refreshedSession());
    vi.stubGlobal("fetch", fetchMock);

    await expect(getFreshSupabaseAccessToken()).resolves.toBe("access-new");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${config.url}/auth/v1/token?grant_type=refresh_token`);
    expect(JSON.parse(init.body)).toEqual({ refresh_token: "refresh-first" });
    expect(init.headers).toMatchObject({ apikey: config.anonKey });

    // The new session is persisted with the *rotated* refresh token, so the next
    // request costs no round trip and the spent token is never presented again.
    expect(stored(store)).toMatchObject({ access_token: "access-new", refresh_token: "refresh-second" });
    await expect(getFreshSupabaseAccessToken()).resolves.toBe("access-new");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a live token without asking Supabase for anything", async () => {
    store.set(SESSION_STORAGE_KEY, storedSession(3600));
    const fetchMock = vi.fn().mockResolvedValue(refreshedSession());
    vi.stubGlobal("fetch", fetchMock);

    await expect(getFreshSupabaseAccessToken()).resolves.toBe("access-old");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes once for callers that arrive together", async () => {
    // Supabase rotates the refresh token, so a second concurrent refresh would
    // present a spent one, be refused, and sign the Learner out. tRPC batches
    // fire together on page load, which is exactly when a session is stale.
    store.set(SESSION_STORAGE_KEY, storedSession(-60));
    const fetchMock = vi.fn().mockResolvedValue(refreshedSession());
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await Promise.all([getFreshSupabaseAccessToken(), getFreshSupabaseAccessToken(), getFreshSupabaseAccessToken()]);

    expect(tokens).toEqual(["access-new", "access-new", "access-new"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stores an expiry computed from expires_in when that is all Supabase sends", async () => {
    // Stored with no expiry at all, every later request would refresh again,
    // forever. Supabase sends both forms; this keeps working if it sends one.
    store.set(SESSION_STORAGE_KEY, storedSession(-60));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refreshedSession({ expires_at: undefined, expires_in: 3600 })));

    await expect(getFreshSupabaseAccessToken()).resolves.toBe("access-new");

    const expiresAt = stored(store)?.expires_at ?? 0;
    expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 3500);
    expect(expiresAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 3600);
  });

  it("refuses a refreshed session whose life it cannot know", async () => {
    store.set(SESSION_STORAGE_KEY, storedSession(-60));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refreshedSession({ expires_at: undefined, expires_in: undefined })));

    await expect(getFreshSupabaseAccessToken()).resolves.toBeNull();
    expect(store.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it("clears a session Supabase will not refresh, so the app offers a sign-in", async () => {
    store.set(SESSION_STORAGE_KEY, storedSession(-60));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })));

    await expect(getFreshSupabaseAccessToken()).resolves.toBeNull();
    expect(store.has(SESSION_STORAGE_KEY)).toBe(false);
    expect(hasSupabaseSession()).toBe(false);
  });

  it("keeps the session when the network fails, so an offline moment is not a sign-out", async () => {
    store.set(SESSION_STORAGE_KEY, storedSession(-60));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(getFreshSupabaseAccessToken()).resolves.toBeNull();
    expect(store.has(SESSION_STORAGE_KEY)).toBe(true);
    expect(hasSupabaseSession()).toBe(true);
  });

  it("cannot refresh a session stored before the config was kept, and says so", async () => {
    store.delete(CONFIG_STORAGE_KEY);
    store.set(SESSION_STORAGE_KEY, storedSession(-60));
    const fetchMock = vi.fn().mockResolvedValue(refreshedSession());
    vi.stubGlobal("fetch", fetchMock);

    await expect(getFreshSupabaseAccessToken()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.has(SESSION_STORAGE_KEY)).toBe(false);
  });
});

describe("what the rest of the client reads off the stored session", () => {
  beforeEach(() => {
    store = installLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("still reports a session across the expiry, because it can be refreshed", () => {
    // The UI must not flip to signed-out on the hour: that is the symptom, not
    // the cure. It flips only when there is nothing left to refresh with.
    store.set(SESSION_STORAGE_KEY, storedSession(-3600));
    expect(hasSupabaseSession()).toBe(true);

    store.set(SESSION_STORAGE_KEY, JSON.stringify({ access_token: "access-old", expires_at: Math.floor(Date.now() / 1000) - 3600, user: { id: "learner-1" } }));
    expect(hasSupabaseSession()).toBe(false);
  });

  it("forgets the session and the config together", () => {
    store.set(SESSION_STORAGE_KEY, storedSession(3600));
    clearSupabaseSession();
    expect(store.has(SESSION_STORAGE_KEY)).toBe(false);
    expect(store.has(CONFIG_STORAGE_KEY)).toBe(false);
  });

  it("writes the config down at sign-in, which is the only place it is known", async () => {
    store.delete(CONFIG_STORAGE_KEY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refreshedSession({ access_token: "access-fresh" })));

    await signInWithPassword(config, "learner@example.com", "correct horse battery staple");

    expect(JSON.parse(store.get(CONFIG_STORAGE_KEY)!)).toEqual(config);
    expect(stored(store)?.access_token).toBe("access-fresh");
  });

  it("does not mistake a signup awaiting confirmation for a session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: "learner-2" } }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await signInWithPassword(config, "learner@example.com", "correct horse battery staple");

    expect(store.has(SESSION_STORAGE_KEY)).toBe(false);
    expect(hasSupabaseSession()).toBe(false);
  });
});
