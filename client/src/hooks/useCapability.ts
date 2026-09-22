import { trpc } from "@/lib/trpc";
import { capabilityState } from "@shared/availability";
import type { CapabilityState, ForgeCapability } from "@shared/availability";

/**
 * Whether one Forge-backed capability can run, for a page to show: "pending"
 * while the answer loads, then "available" or "unavailable". The rule lives in
 * capabilityState (shared/availability.ts), where it is tested, because the
 * client has no test runner of its own.
 */
export function useCapability(capability: ForgeCapability): CapabilityState {
  return capabilityState(trpc.availability.status.useQuery(), capability);
}
