import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { skipWithoutCredentials } from "./testing/credentials";

const SUPABASE_VARIABLES = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

/**
 * Ticket 17. A few tests assert against a real Supabase project or a real
 * Paystack key, and so can only run where those credentials are set. Everywhere
 * else they skip and name the variables they were waiting for, so that a red
 * suite means something again. Where they must run, REQUIRE_CREDENTIALS turns
 * that skip into a failure.
 */
describe("skipWithoutCredentials", () => {
  // Pinned off, so these hold even in a run that has it on.
  beforeEach(() => vi.stubEnv("REQUIRE_CREDENTIALS", undefined));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Vitest's own skip throws to end the test; the stand-in only records the call.
  const testContext = () => ({ skip: vi.fn() });
  const silenceWarnings = () => vi.spyOn(console, "warn").mockImplementation(() => {});

  it("skips a test whose credentials are absent, naming each missing variable", () => {
    for (const name of SUPABASE_VARIABLES) vi.stubEnv(name, undefined);
    const warn = silenceWarnings();
    const context = testContext();

    skipWithoutCredentials(context, SUPABASE_VARIABLES);

    expect(context.skip).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("Skipped: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY not set.");
  });

  // An unset secret usually reaches a CI job as an empty string, so empty counts
  // as missing.
  it("names only the variables that are missing, counting an empty one as missing", () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
    const warn = silenceWarnings();
    const context = testContext();

    skipWithoutCredentials(context, SUPABASE_VARIABLES);

    expect(context.skip).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("Skipped: SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY not set.");
  });

  it("lets a test whose credentials are all present run, and says nothing", () => {
    for (const name of SUPABASE_VARIABLES) vi.stubEnv(name, `${name.toLowerCase()}-value`);
    const warn = silenceWarnings();
    const context = testContext();

    skipWithoutCredentials(context, SUPABASE_VARIABLES);

    expect(context.skip).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  // Vitest does not load .env, so a run meant to use real keys can lack them
  // without anyone noticing: every gated test would skip and the suite would
  // read green. A run that must reach the real services sets REQUIRE_CREDENTIALS.
  it("fails a test whose credentials are absent, rather than skipping it, when they are required", () => {
    vi.stubEnv("REQUIRE_CREDENTIALS", "1");
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", undefined);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const context = testContext();

    expect(() => skipWithoutCredentials(context, SUPABASE_VARIABLES)).toThrow("SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY not set, and REQUIRE_CREDENTIALS is on.");
    expect(context.skip).not.toHaveBeenCalled();
  });
});
