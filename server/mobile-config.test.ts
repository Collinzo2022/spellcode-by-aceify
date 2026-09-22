import type express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import { createSpellCodeApp } from "./app";
import { appRouter } from "./routers";

// The Supabase configuration is read from ENV on every call, and ENV is a plain
// object, so these tests configure the server by assigning to it and put back
// what the file started with afterwards.
const original = { ...ENV };
afterEach(() => {
  Object.assign(ENV, original);
  vi.unstubAllEnvs();
});

// Four distinct values, none a substring of another, so a leak of any one of
// them cannot hide inside another.
const SUPABASE_URL = "https://mobile-config-test.supabase.co";
const ANON_KEY = "anon-key-public-by-design";
const SERVICE_ROLE_KEY = "service-role-key-never-leaves-the-server";
const PAYSTACK_SECRET = "sk_test_paystack-secret-never-leaves-the-server";

// The two secrets go into process.env as well as ENV, so a route that reads
// either is caught leaking them. The public values go into ENV alone, so a route
// that bypasses getSupabasePublicConfig for process.env answers the wrong ones.
function configure(config: { url: string; anonKey: string }) {
  ENV.supabaseUrl = config.url;
  ENV.supabaseAnonKey = config.anonKey;
  ENV.supabaseServiceRoleKey = SERVICE_ROLE_KEY;
  ENV.paystackSecretKey = PAYSTACK_SECRET;
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
  vi.stubEnv("PAYSTACK_SECRET_KEY", PAYSTACK_SECRET);
}

let app: express.Express;

beforeEach(() => {
  configure({ url: SUPABASE_URL, anonKey: ANON_KEY });
  app = createSpellCodeApp();
});

/**
 * Drive the real application with no credentials at all: a phone asks for this
 * before anyone can have signed in. The raw text is kept as well as the parsed
 * body, so a secret is caught wherever in the response it turns up.
 */
async function fetchConfig() {
  const server = await new Promise<ReturnType<express.Express["listen"]>>(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const response = await fetch(`http://127.0.0.1:${port}/api/mobile/config`);
  const text = await response.text();
  await new Promise<void>(resolve => server.close(() => resolve()));
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* not JSON: body stays null */ }
  return { status: response.status, headers: response.headers, text, body };
}

/**
 * Ticket 16. The route lets a mobile client build in only the API address and
 * fetch the rest at startup, as the web does, so that a change of Supabase
 * project or key need not mean a new release. The released Android APK predates
 * it and still has the key built in.
 */
describe("the mobile Supabase configuration", () => {
  it("answers without a bearer token, with the project URL and anon key and nothing else", async () => {
    const { status, body } = await fetchConfig();

    expect(status).toBe(200);
    expect(body).toEqual({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: ANON_KEY });
  });

  // A server with no Supabase project is out of service, not broken: 503, so a
  // client can tell "try later" from "this is a bug". The JSON content type and
  // the exact body are what rule out Express's default 500 page and its stack.
  it.each([
    ["the anon key", { url: SUPABASE_URL, anonKey: "" }],
    ["the project URL", { url: "", anonKey: ANON_KEY }],
  ])("answers 503 with a plain error when %s is missing", async (_missing, config) => {
    configure(config);

    const { status, headers, body } = await fetchConfig();

    expect(status).toBe(503);
    expect(headers.get("content-type")).toMatch(/^application\/json/);
    expect(body).toEqual({ error: expect.stringMatching(/unavailable/i) });
  });

  // The route is public, so anything it carries is published. The server holds
  // both secrets in every test here; the second arm is the tempting mistake of
  // falling back to the service-role key when the anon key is missing. The
  // status is pinned so that neither arm passes against a route that is gone.
  it.each([
    ["when configured", { url: SUPABASE_URL, anonKey: ANON_KEY }, 200],
    ["when the anon key is missing", { url: SUPABASE_URL, anonKey: "" }, 503],
  ])("never carries the service-role key or the Paystack secret %s", async (_state, config, expectedStatus) => {
    configure(config);

    const { status, text, headers } = await fetchConfig();
    const everything = [text, ...Array.from(headers.values())].join("\n");

    expect(status).toBe(expectedStatus);
    expect(everything).not.toContain(SERVICE_ROLE_KEY);
    expect(everything).not.toContain(PAYSTACK_SECRET);
  });
});

/**
 * The phone and the browser read the same settings. These compare the two
 * routes' answers under one configuration; that they share a source is what
 * keeps them agreeing, and that is by construction rather than something a test
 * observes.
 */
describe("the mobile and web Supabase configurations", () => {
  const web = appRouter.createCaller({ user: null, req: {}, res: {} } as any).auth;

  it("agree on the project URL and anon key", async () => {
    const { url, anonKey } = await web.supabaseConfig();
    const { body } = await fetchConfig();

    expect(body).toEqual({ supabaseUrl: url, supabaseAnonKey: anonKey });
  });

  it("are unavailable together", async () => {
    configure({ url: SUPABASE_URL, anonKey: "" });

    await expect(web.supabaseConfig()).rejects.toThrow(/unavailable/i);
    expect((await fetchConfig()).status).toBe(503);
  });
});
