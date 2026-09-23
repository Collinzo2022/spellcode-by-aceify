import { UTC_OFFSET_HEADER } from "../../shared/utcOffset";

/**
 * An Express-shaped request for a tRPC caller in a test.
 *
 * Tests used to pass `req: {}`, which was enough while nothing read the
 * request. Ticket 11 made the Local Day offset load-bearing - it decides both
 * the day a Completion is stamped with and the day a Streak is read against -
 * so a request that cannot answer `header()` is no longer a faithful stand-in
 * for one.
 *
 * Kept as a stub with a real `header` rather than making `offsetMinutesOf`
 * tolerate a missing one: a production request always has it, so a reader that
 * shrugged at its absence would turn a wiring mistake into a silent UTC, which
 * is the exact failure this ticket exists to remove.
 *
 * Omitting `offsetMinutes` models an older client that sends no header, which
 * the contract reads as UTC.
 */
export function stubRequest(offsetMinutes?: number) {
  const headers: Record<string, string> = offsetMinutes === undefined ? {} : { [UTC_OFFSET_HEADER]: String(offsetMinutes) };
  return { header: (name: string) => headers[name.toLowerCase()] };
}
