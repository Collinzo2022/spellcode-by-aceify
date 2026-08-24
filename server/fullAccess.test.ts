import { describe, expect, it } from "vitest";
import {
  canIssueCertificate,
  lessonRequiresFullAccess,
} from "../shared/fullAccess";

describe("Full Access policy", () => {
  it("keeps Level 1 available while requiring Full Access after it", () => {
    expect(lessonRequiresFullAccess(1)).toBe(false);
    expect(lessonRequiresFullAccess(2)).toBe(true);
  });

  it("issues certificates only after Full Access and all required lessons", () => {
    expect(canIssueCertificate(false, 12, 12)).toBe(false);
    expect(canIssueCertificate(true, 11, 12)).toBe(false);
    expect(canIssueCertificate(true, 12, 12)).toBe(true);
  });
});
