import { describe, expect, it } from "vitest";
import { canIssueCertificate, canUsePaidFeature, lessonRequiresFullAccess } from "../shared/entitlements";

describe("Full Access entitlement policy", () => {
  it("keeps Level 1 available while requiring Full Access after it", () => {
    expect(lessonRequiresFullAccess(1)).toBe(false);
    expect(lessonRequiresFullAccess(2)).toBe(true);
  });

  it("requires verified Full Access for publishing and AI tutor features", () => {
    expect(canUsePaidFeature(false, "project_publishing")).toBe(false);
    expect(canUsePaidFeature(false, "ai_tutor")).toBe(false);
    expect(canUsePaidFeature(true, "project_publishing")).toBe(true);
    expect(canUsePaidFeature(true, "ai_tutor")).toBe(true);
  });

  it("issues certificates only after Full Access and all required lessons", () => {
    expect(canIssueCertificate(false, 12, 12)).toBe(false);
    expect(canIssueCertificate(true, 11, 12)).toBe(false);
    expect(canIssueCertificate(true, 12, 12)).toBe(true);
  });
});
