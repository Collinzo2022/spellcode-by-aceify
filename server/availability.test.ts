import { afterEach, describe, expect, it } from "vitest";
import { stubRequest } from "./testing/request";
import { TRPCError } from "@trpc/server";
import { assertAvailable, availability } from "./availability";
import { availabilityRouter } from "./routers/availability";
import { capabilityState } from "../shared/availability";
import { configureForge, forgeOff, forgeOn, restoreForge } from "./testing/forge";

// Forge, the Manus platform service behind the tutor, Project publishing and
// certificates, can no longer be configured: its key belonged to Manus. These
// tests pin the one place that decides whether those capabilities can run, and
// the rule every page follows while it finds out.

afterEach(restoreForge);

const ALL = { tutor: true, projectPublishing: true, certificates: true };
const NONE = { tutor: false, projectPublishing: false, certificates: false };

describe("availability", () => {
  it("makes all three capabilities available when both Forge variables are set", () => {
    forgeOn();
    expect(availability()).toEqual(ALL);
  });

  it("makes none available when Forge is not configured at all", () => {
    forgeOff();
    expect(availability()).toEqual(NONE);
  });

  it("needs both variables: a URL alone is not enough", () => {
    configureForge("https://forge.example.test", "");
    expect(availability()).toEqual(NONE);
  });

  it("needs both variables: a key alone is not enough", () => {
    configureForge("", "forge-key");
    expect(availability()).toEqual(NONE);
  });

  it("treats a whitespace-only value as missing", () => {
    configureForge("   ", "forge-key");
    expect(availability()).toEqual(NONE);
  });
});

describe("assertAvailable", () => {
  it("passes when the capability is available", () => {
    forgeOn();
    expect(() => assertAvailable("tutor")).not.toThrow();
  });

  it("refuses with a 503-class error, not a 500, when it is not", () => {
    forgeOff();
    let caught: unknown;
    try {
      assertAvailable("projectPublishing");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe("SERVICE_UNAVAILABLE");
    expect((caught as TRPCError).message).toMatch(/temporarily unavailable/);
  });
});

describe("the availability.status query", () => {
  // Public: it carries three booleans and nothing about any Learner.
  const caller = availabilityRouter.createCaller({ user: null, req: stubRequest(), res: {} } as any);

  it("reports every capability unavailable without Forge", async () => {
    forgeOff();
    await expect(caller.status()).resolves.toEqual(NONE);
  });

  it("reports every capability available with Forge", async () => {
    forgeOn();
    await expect(caller.status()).resolves.toEqual(ALL);
  });
});

// The rule the review caught missing: a page that has not heard back yet must
// not treat the capability as available, or it briefly offers a working button,
// or a Full Access upsell for something that is off, and keeps offering it if
// the query fails.
describe("capabilityState, what a page shows", () => {
  const answered = { tutor: true, projectPublishing: false, certificates: false };

  it("is pending while the query has not answered", () => {
    expect(capabilityState({ isError: false }, "tutor")).toBe("pending");
  });

  it("counts a query that failed before answering as unavailable, never as available", () => {
    expect(capabilityState({ isError: true }, "tutor")).toBe("unavailable");
  });

  it("follows the answer once there is one", () => {
    expect(capabilityState({ data: answered, isError: false }, "tutor")).toBe("available");
    expect(capabilityState({ data: answered, isError: false }, "certificates")).toBe("unavailable");
  });

  it("keeps the last answer when a later refetch fails", () => {
    expect(capabilityState({ data: answered, isError: true }, "tutor")).toBe("available");
  });
});
