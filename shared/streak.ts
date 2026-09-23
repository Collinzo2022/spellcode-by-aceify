/**
 * A Streak, as arithmetic on Local Days.
 *
 * `CONTEXT.md` defines a Streak as consecutive days on which a Learner
 * completed at least one unit of learning. All five kinds count equally, and a
 * day is the Learner's own day, not UTC's: `shared/utcOffset.ts` carries the
 * offset their client sends.
 *
 * Everything here is pure - an instant and an offset in, a value out - so the
 * cases that actually go wrong (midnight, a changed offset, a flight west) are
 * testable without a database, and so the write side and the read side cannot
 * drift into disagreeing about what a day is.
 *
 * The storage this serves is two columns, decided 2026-09-22: `current_streak`
 * holds the length of the run, and `last_learning_day` the Local Day it was
 * last extended on. A single date cannot recover a run's length, and recomputing
 * from Completion history would need the offset each Completion was made under,
 * which no Completion table records.
 */

const DAY_MS = 86_400_000;

/** A run of consecutive Local Days, and the day it last reached. */
export type StreakRun = {
  /** How many consecutive Local Days the run covers. */
  run: number;
  /** The Local Day the run was last extended on, `YYYY-MM-DD`, or null if never. */
  lastLearningDay: string | null;
};

/**
 * The Local Day an instant falls on, for a Learner at `offsetMinutes` east of UTC.
 *
 * Shifting the instant and then reading the UTC date is the whole calculation:
 * a fixed offset is exactly a translation of the timeline, so the local calendar
 * date of an instant is the UTC date of the shifted one.
 */
export function localDayKey(instant: Date, offsetMinutes: number): string {
  return new Date(instant.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * The run after a Learner completes a unit of learning at `completedAt`.
 *
 * Four cases, in the order they are decided:
 *
 * - the same Local Day as the run's last: unchanged, so several Completions in
 *   one day advance a Streak once;
 * - an *earlier* Local Day than the run's last: unchanged. Decided 2026-09-22 -
 *   a westward trip changes nothing, because moving the stored day backwards
 *   would let the day it came from be counted twice;
 * - the day immediately after: the run grows by one;
 * - any later day, or no run yet: a new run of 1.
 *
 * Note this never consults the clock. A Streak lapses on *read* (`deriveStreak`),
 * not by a write that has to happen at the right moment, which is what lets it
 * lapse with no job.
 */
export function extendStreak(current: StreakRun, completedAt: Date, offsetMinutes: number): StreakRun {
  const day = localDayKey(completedAt, offsetMinutes);
  if (current.lastLearningDay === null) return { run: 1, lastLearningDay: day };
  if (day <= current.lastLearningDay) return current;

  const dayBefore = localDayKey(new Date(completedAt.getTime() - DAY_MS), offsetMinutes);
  return { run: current.lastLearningDay === dayBefore ? current.run + 1 : 1, lastLearningDay: day };
}

/**
 * The Streak to show a Learner reading at `now` from `offsetMinutes`.
 *
 * A run stands while its last day is today or yesterday in the *reading*
 * request's Local Day, and is zero otherwise. Yesterday counts because a
 * Learner who has not yet practised today has not broken anything.
 *
 * Deriving this on read is the point of the ticket: a stored value is only
 * correct until the Learner stops, and the Learners a Streak exists to pull
 * back are exactly the ones who stopped.
 */
export function deriveStreak(run: number, lastLearningDay: string | null, now: Date, offsetMinutes: number): number {
  if (lastLearningDay === null) return 0;
  const today = localDayKey(now, offsetMinutes);
  const yesterday = localDayKey(new Date(now.getTime() - DAY_MS), offsetMinutes);
  return lastLearningDay === today || lastLearningDay === yesterday ? run : 0;
}
