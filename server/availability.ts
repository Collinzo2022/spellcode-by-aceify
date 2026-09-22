// Decides whether each Forge-backed capability can run. shared/availability.ts
// holds the names, the wording and the page rule; this reads the configuration.
//
// server/storage.ts keeps its own guard for its own calls. This one decides what
// Learners are offered, and it is the stricter of the two: a whitespace-only
// value counts as missing here.
//
// Reading ENV from the vendored _core is fine; nothing in it changes.
import { TRPCError } from "@trpc/server";
import { UNAVAILABLE_MESSAGE } from "../shared/availability";
import type { Availability, ForgeCapability } from "../shared/availability";
import { ENV } from "./_core/env";

/** Forge counts as configured only when both of its variables are set. */
function forgeReady(): boolean {
  return ENV.forgeApiUrl.trim().length > 0 && ENV.forgeApiKey.trim().length > 0;
}

export function availability(): Availability {
  const ready = forgeReady();
  return { tutor: ready, projectPublishing: ready, certificates: ready };
}

/**
 * Refuses a capability that cannot run, as SERVICE_UNAVAILABLE (503) rather
 * than the 500 a missing Forge configuration surfaces as. Call it before the
 * Full Access check, so no Learner is told to buy access to something that is
 * off.
 */
export function assertAvailable(capability: ForgeCapability): void {
  if (!availability()[capability]) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: UNAVAILABLE_MESSAGE[capability] });
}
