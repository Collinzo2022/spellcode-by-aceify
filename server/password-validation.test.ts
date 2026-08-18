import { describe, expect, it } from "vitest";
import { getConfirmPasswordError } from "../shared/passwordValidation";

describe("getConfirmPasswordError", () => {
  it("allows matching passwords", () => {
    expect(getConfirmPasswordError("SpellCode2026", "SpellCode2026")).toBeNull();
  });

  it("rejects different passwords", () => {
    expect(getConfirmPasswordError("SpellCode2026", "Spellcode2026")).toBe("Passwords do not match.");
  });
});
