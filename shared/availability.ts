// Which Forge-backed capabilities can run, and what a page shows while it finds
// out. Shared so the server's refusal and the client's pages can never disagree
// on the wording or on the rule.
//
// Forge, the Manus platform's built-in service, backed three capabilities: the
// AI tutor (an LLM call), and Project publishing and certificates (file
// storage). Its key belonged to Manus, so off Manus none of them can run until
// each moves to a provider of its own (ticket 15, and the two follow-ups).

export type ForgeCapability = "tutor" | "projectPublishing" | "certificates";

export type Availability = Record<ForgeCapability, boolean>;

export const UNAVAILABLE_MESSAGE: Record<ForgeCapability, string> = {
  tutor: "The AI tutor is temporarily unavailable.",
  projectPublishing: "Project publishing is temporarily unavailable.",
  certificates: "Certificate issuing is temporarily unavailable.",
};

export type CapabilityState = "pending" | "available" | "unavailable";

/**
 * What a page should do with one capability, given the availability query.
 *
 * Not knowing is not the same as available. While the answer loads, a page
 * shows neither the capability nor a Full Access upsell for it. If the query
 * fails before answering, the capability counts as unavailable: the answer the
 * server would give anyway, and never an invitation to buy something that is
 * off. Once answered, a later failed refetch keeps the last answer.
 */
export function capabilityState(query: { data?: Availability; isError: boolean }, capability: ForgeCapability): CapabilityState {
  if (query.data) return query.data[capability] ? "available" : "unavailable";
  return query.isError ? "unavailable" : "pending";
}
