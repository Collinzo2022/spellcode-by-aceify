/**
 * The Learner's own clock, as their client reports it.
 *
 * One contract in one place: the sign convention, the header name and the range
 * belong together, because the client that writes the value and the server that
 * reads it must change together. CONTEXT.md defines the Local Day this serves;
 * docs/production_architecture.md records the contract and its known limits.
 */

/** The header both clients send it on. */
export const UTC_OFFSET_HEADER = "x-utc-offset-minutes";

/** UTC-12:00, the westernmost real offset. */
export const MIN_UTC_OFFSET_MINUTES = -720;

/** UTC+14:00, the easternmost real offset. */
export const MAX_UTC_OFFSET_MINUTES = 840;

/** Minutes east of UTC, the sign a Learner would recognise: UTC+1 is 60. */
const OFFSET_PATTERN = /^[+-]?\d+$/;

/**
 * Minutes east of UTC, from what a client sent.
 *
 * An absent offset is UTC: that is how an older client behaves, and a Learner's
 * lesson must never fail because their client is out of date.
 *
 * A present but malformed offset throws instead. It can only come from a broken
 * client - both clients read the value off the machine's own clock, which
 * cannot produce garbage - and reading it as UTC would quietly hand that
 * Learner a Streak that rolls over at the wrong hour.
 */
export function parseUtcOffsetMinutes(raw: string | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  if (!OFFSET_PATTERN.test(trimmed)) throw new Error(`A UTC offset must be a whole number of minutes; received "${raw}".`);
  const minutes = Number(trimmed);
  if (minutes < MIN_UTC_OFFSET_MINUTES || minutes > MAX_UTC_OFFSET_MINUTES) throw new Error(`A UTC offset must be between ${MIN_UTC_OFFSET_MINUTES} and ${MAX_UTC_OFFSET_MINUTES} minutes; received "${raw}".`);
  return minutes;
}

/**
 * The header a client sends, read fresh from the machine it runs on.
 *
 * `getTimezoneOffset` counts minutes *west* of UTC, the opposite convention, so
 * the sign is flipped here rather than at every reader.
 */
export function currentUtcOffsetHeader(): Record<string, string> {
  return { [UTC_OFFSET_HEADER]: String(-new Date().getTimezoneOffset()) };
}
