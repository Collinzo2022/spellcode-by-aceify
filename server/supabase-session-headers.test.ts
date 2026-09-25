import { TRPCClientError } from "@trpc/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNAUTHED_ERR_MSG } from "../shared/const";
import { CONFIG_STORAGE_KEY, SESSION_STORAGE_KEY, parseStoredSession, type SupabaseSession } from "../shared/supabaseSession";
import { UTC_OFFSET_HEADER } from "../shared/utcOffset";
import { classifyRequestError, requestHeaders } from "../client/src/lib/trpcAuth";

/**
 * The wiring ticket 27 actually hid in.
 *
 * Every other test here can pass while the app stays broken, because the defect
 * was never in a function — it was in what `main.tsx` did with one. So the header
 * assembly and the 401 response live in `trpcAuth.ts`, which a test can import,
 * and `main.tsx` is left with nothing but the wiring. Ticket 24 was opened for the
 * same shape of hole on the server side.
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

const refreshedSession = () =>
  new Response(JSON.stringify({ access_token: "access-new", refresh_token: "refresh-second", expires_in: 3600, user: { id: "learner-1" } }), { status: 200, headers: { "Content-Type": "application/json" } });

let store: Map<string, string>;

describe("the headers a request leaves with", () => {
  beforeEach(() => {
    store = installLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renews an expired token and sends the new one", async () => {
    store.set(SESSION_STORAGE_KEY, storedSession(-60));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refreshedSession()));

    const headers = await requestHeaders();

    // Drop the await inside requestHeaders and Authorization disappears from
    // here entirely, which is ticket 27 restored with the suite still green.
    expect(headers.Authorization).toBe("Bearer access-new");
    expect(headers[UTC_OFFSET_HEADER]).toBe(String(-new Date().getTimezoneOffset()));
  });

  it("sends a live token untouched, and the Learner's offset with it", async () => {
    store.set(SESSION_STORAGE_KEY, storedSession(3600));
    const fetchMock = vi.fn().mockResolvedValue(refreshedSession());
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestHeaders()).resolves.toMatchObject({ Authorization: "Bearer access-old", [UTC_OFFSET_HEADER]: String(-new Date().getTimezoneOffset()) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carries no Authorization when there is no session, rather than an empty one", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const headers = await requestHeaders();

    expect("Authorization" in headers).toBe(false);
    expect(headers[UTC_OFFSET_HEADER]).toBeDefined();
  });
});

describe("what the app does with a refused request", () => {
  beforeEach(() => {
    store = installLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not send a Learner to sign in while their session can still be renewed", () => {
    // The forbidden cure: "an interceptor that redirects to /login on any 401
    // would log Learners out mid-lesson on every expiry" (ticket 27).
    store.set(SESSION_STORAGE_KEY, storedSession(3600, "access-rejected"));

    expect(classifyRequestError(new TRPCClientError(UNAUTHED_ERR_MSG))).toBe("refresh-next");

    // The token is marked spent, so the very next request renews it instead of
    // sending the one the server just refused.
    expect(parseStoredSession(store.get(SESSION_STORAGE_KEY))?.expires_at).toBe(0);
  });

  it("asks for a sign-in only once nothing is left to renew", () => {
    store.set(SESSION_STORAGE_KEY, JSON.stringify({ access_token: "access-old", expires_at: Math.floor(Date.now() / 1000) - 60, user: { id: "learner-1" } }));
    expect(classifyRequestError(new TRPCClientError(UNAUTHED_ERR_MSG))).toBe("sign-in");

    store.delete(SESSION_STORAGE_KEY);
    expect(classifyRequestError(new TRPCClientError(UNAUTHED_ERR_MSG))).toBe("sign-in");
  });

  it("leaves errors that are not about authentication alone", () => {
    store.set(SESSION_STORAGE_KEY, storedSession(3600));
    expect(classifyRequestError(new TRPCClientError("Something else went wrong"))).toBe("ignored");
    expect(classifyRequestError(new Error(UNAUTHED_ERR_MSG))).toBe("ignored");
    expect(classifyRequestError(undefined)).toBe("ignored");
    expect(parseStoredSession(store.get(SESSION_STORAGE_KEY))?.expires_at).not.toBe(0);
  });

  it("stops marking the same token spent, so one rejection is not chased forever", () => {
    store.set(SESSION_STORAGE_KEY, storedSession(3600, "access-looping"));

    expect(classifyRequestError(new TRPCClientError(UNAUTHED_ERR_MSG))).toBe("refresh-next");
    // A second rejection of the same token writes nothing further: without this
    // a server refusing every token would refresh once per request, forever.
    store.set(SESSION_STORAGE_KEY, storedSession(3600, "access-looping"));
    classifyRequestError(new TRPCClientError(UNAUTHED_ERR_MSG));
    expect(parseStoredSession(store.get(SESSION_STORAGE_KEY))?.expires_at).not.toBe(0);
  });
});
