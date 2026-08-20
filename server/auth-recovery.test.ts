import { describe, expect, it } from "vitest";
import { getEmailRateLimitMessage, getSignupCooldownStorageKey, isEmailRateLimitError, isSignupCooldownActive } from "../shared/authRecovery";

describe("sign-up email rate-limit recovery", () => {
  it("recognizes a Supabase 429 response", () => {
    expect(isEmailRateLimitError(429, "Unable to authenticate.")).toBe(true);
  });

  it("recognizes Supabase's email rate-limit wording", () => {
    expect(isEmailRateLimitError(400, "Email rate limit exceeded")).toBe(true);
  });

  it("does not classify unrelated sign-up errors as rate limits", () => {
    expect(isEmailRateLimitError(400, "Password should be at least 6 characters.")).toBe(false);
  });

  it("gives the learner a specific retry instruction", () => {
    expect(getEmailRateLimitMessage()).toContain("one hour");
  });

  it("keys a successful sign-up cooldown to the normalized email address", () => {
    expect(getSignupCooldownStorageKey("  Learner@Example.com ")).toBe("spellcode-signup-email-retry-at:learner@example.com");
  });

  it("only blocks another confirmation request while the cooldown is active", () => {
    expect(isSignupCooldownActive(5_001, 5_000)).toBe(true);
    expect(isSignupCooldownActive(5_000, 5_000)).toBe(false);
  });
});
