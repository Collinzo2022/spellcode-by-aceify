import { describe, expect, it } from "vitest";
import { deriveStreak, extendStreak, localDayKey } from "../shared/streak";
import { parseUtcOffsetMinutes } from "../shared/utcOffset";

/**
 * Ticket 11: a Streak counts consecutive Local Days on which a Learner
 * completed at least one unit of learning.
 *
 * The derivation is a pure function of an instant and an offset, so its edge
 * cases live here rather than in staged scenarios against a database. Every
 * case the ticket names is below.
 */
describe("the Local Day a Completion belongs to", () => {
  it("treats a missing offset as UTC", () => {
    // Read through `parseUtcOffsetMinutes` rather than passing 0, so this tests
    // absence rather than restating it: an older client sends no header at all,
    // and what the contract makes of that is the thing worth pinning.
    expect(localDayKey(new Date("2026-09-23T23:30:00.000Z"), parseUtcOffsetMinutes(undefined))).toBe("2026-09-23");
    expect(localDayKey(new Date("2026-09-24T00:30:00.000Z"), parseUtcOffsetMinutes(undefined))).toBe("2026-09-24");
  });

  it("puts an instant after local midnight on the next local day", () => {
    // 23:30 UTC is 00:30 the next day in UTC+1.
    expect(localDayKey(new Date("2026-09-23T23:30:00.000Z"), 60)).toBe("2026-09-24");
  });

  it("puts an instant before local midnight on the previous local day", () => {
    // 00:30 UTC is 19:30 the previous day in UTC-5.
    expect(localDayKey(new Date("2026-09-24T00:30:00.000Z"), -300)).toBe("2026-09-23");
  });
});

describe("extending a Streak", () => {
  const offsetUtc = 0;

  it("starts a run at 1 for a Learner who has never completed anything", () => {
    expect(extendStreak({ run: 0, lastLearningDay: null }, new Date("2026-09-23T10:00:00.000Z"), offsetUtc)).toEqual({ run: 1, lastLearningDay: "2026-09-23" });
  });

  it("advances once however many times a Learner completes on the same local day", () => {
    const afterFirst = extendStreak({ run: 3, lastLearningDay: "2026-09-22" }, new Date("2026-09-23T08:00:00.000Z"), offsetUtc);
    const afterSecond = extendStreak(afterFirst, new Date("2026-09-23T20:00:00.000Z"), offsetUtc);

    expect(afterFirst).toEqual({ run: 4, lastLearningDay: "2026-09-23" });
    expect(afterSecond).toEqual(afterFirst);
  });

  it("restarts at 1 when a day was missed", () => {
    expect(extendStreak({ run: 12, lastLearningDay: "2026-09-20" }, new Date("2026-09-23T10:00:00.000Z"), offsetUtc)).toEqual({ run: 1, lastLearningDay: "2026-09-23" });
  });

  it("counts two Completions either side of local midnight as two days", () => {
    // The ticket's first named case. In UTC+1 these instants are 23:30 on the
    // 23rd and 00:30 on the 24th, so the run reaches 2.
    const evening = extendStreak({ run: 0, lastLearningDay: null }, new Date("2026-09-23T22:30:00.000Z"), 60);
    const justAfterMidnight = extendStreak(evening, new Date("2026-09-23T23:30:00.000Z"), 60);

    expect(evening).toEqual({ run: 1, lastLearningDay: "2026-09-23" });
    expect(justAfterMidnight).toEqual({ run: 2, lastLearningDay: "2026-09-24" });
  });

  it("keeps a run when the offset changes between two Completions but the days stay consecutive", () => {
    // The ticket's fourth named case: a Learner who flies east mid-run.
    const atHome = extendStreak({ run: 4, lastLearningDay: "2026-09-22" }, new Date("2026-09-23T10:00:00.000Z"), 0);
    const afterFlight = extendStreak(atHome, new Date("2026-09-23T20:00:00.000Z"), 480);

    expect(atHome).toEqual({ run: 5, lastLearningDay: "2026-09-23" });
    expect(afterFlight).toEqual({ run: 6, lastLearningDay: "2026-09-24" });
  });

  it("merges two Completions onto one local day when the Learner travels west", () => {
    // The ticket's fifth named case. 01:00 UTC on the 24th is still the 23rd in
    // UTC-5, the day already recorded, so the run does not advance twice.
    const beforeFlight = extendStreak({ run: 2, lastLearningDay: "2026-09-22" }, new Date("2026-09-23T10:00:00.000Z"), 0);
    const afterFlight = extendStreak(beforeFlight, new Date("2026-09-24T01:00:00.000Z"), -300);

    expect(beforeFlight).toEqual({ run: 3, lastLearningDay: "2026-09-23" });
    expect(afterFlight).toEqual(beforeFlight);
  });

  it("leaves a run untouched when a Completion lands on an earlier local day than the one stored", () => {
    // Decided 2026-09-22: a westward trip changes nothing. The stored day never
    // moves backwards, or the next Completion would count a day twice.
    expect(extendStreak({ run: 5, lastLearningDay: "2026-09-23" }, new Date("2026-09-22T10:00:00.000Z"), 0)).toEqual({ run: 5, lastLearningDay: "2026-09-23" });
  });
});

describe("deriving a Streak on read", () => {
  const now = new Date("2026-09-23T12:00:00.000Z");

  it("shows the run when the last qualifying day is today", () => {
    expect(deriveStreak(7, "2026-09-23", now, 0)).toBe(7);
  });

  it("shows the run when the last qualifying day is yesterday, which is still live", () => {
    expect(deriveStreak(7, "2026-09-22", now, 0)).toBe(7);
  });

  it("shows zero once the last qualifying day is older than yesterday, with no job to make it happen", () => {
    expect(deriveStreak(7, "2026-09-21", now, 0)).toBe(0);
  });

  it("shows zero for a Learner returning after a long absence, not their old total", () => {
    expect(deriveStreak(12, "2026-07-14", now, 0)).toBe(0);
  });

  it("shows zero for a Learner who has never completed anything", () => {
    expect(deriveStreak(0, null, now, 0)).toBe(0);
  });

  it("reaches different Streaks from opposite-sign offsets over the same instant", () => {
    // The ticket's second named case. At 2026-09-24T00:30Z a Learner in UTC+1
    // is on the 24th, so a run last extended on the 22nd is two days stale and
    // reads zero; a Learner in UTC-5 is still on the 23rd, so the same run is
    // yesterday's and still stands.
    const instant = new Date("2026-09-24T00:30:00.000Z");

    expect(deriveStreak(5, "2026-09-22", instant, 60)).toBe(0);
    expect(deriveStreak(5, "2026-09-22", instant, -300)).toBe(5);
  });

  it("treats a missing offset as UTC on the read side too", () => {
    expect(deriveStreak(3, "2026-09-23", new Date("2026-09-23T23:00:00.000Z"), 0)).toBe(3);
  });
});
