import { expect } from "vitest";

/**
 * Assert a payload offers no feature list to be gated on.
 *
 * Full Access is a single gate (ADR 0001). A features or entitlements array on
 * the wire is an unenforced permission set: harmless to the client that ignores
 * it, and an invitation to the next contributor to gate on it and believe the
 * check is real. Naming the invariant once keeps every payload held to it.
 */
export function expectNoFeatureArray(payload: unknown) {
  expect(payload).not.toHaveProperty("entitlements");
  expect(payload).not.toHaveProperty("features");
}
