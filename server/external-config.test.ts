import { describe, expect, it } from "vitest";
import { skipWithoutCredentials } from "./testing/credentials";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

// These check the environment rather than the code, so they run only where the
// credentials are set, and each waits for only the variables it reads. Having
// passed the gate, their presence checks can no longer fail: the format checks
// and the Supabase request are what they still prove.
describe("external integration credentials", () => {
  it("authenticates to the Supabase project settings endpoint", async context => {
    skipWithoutCredentials(context, ["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
    expect(supabaseUrl).toMatch(/^https:\/\/.+\.supabase\.co$/);
    expect(supabaseAnonKey).toBeTruthy();

    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey! },
    });

    expect(response.ok).toBe(true);
  }, 15_000);

  it("has a configured Paystack secret key for server-side checkout and webhook verification", context => {
    skipWithoutCredentials(context, ["PAYSTACK_SECRET_KEY"]);
    expect(paystackSecretKey).toBeTruthy();
    expect(paystackSecretKey).toMatch(/^sk_(test|live)_/);
  });
});
