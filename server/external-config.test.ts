import { describe, expect, it } from "vitest";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

describe("external integration credentials", () => {
  it("authenticates to the Supabase project settings endpoint", async () => {
    expect(supabaseUrl).toMatch(/^https:\/\/.+\.supabase\.co$/);
    expect(supabaseAnonKey).toBeTruthy();

    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey! },
    });

    expect(response.ok).toBe(true);
  }, 15_000);

  it("has a configured Paystack secret key for server-side checkout and webhook verification", () => {
    expect(paystackSecretKey).toBeTruthy();
    expect(paystackSecretKey).toMatch(/^sk_(test|live)_/);
  });
});
