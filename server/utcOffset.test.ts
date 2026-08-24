import { describe, expect, it } from "vitest";
import { MAX_UTC_OFFSET_MINUTES, MIN_UTC_OFFSET_MINUTES, currentUtcOffsetHeader, parseUtcOffsetMinutes, UTC_OFFSET_HEADER } from "../shared/utcOffset";

/**
 * A Streak is about days the Learner lived, so the server has to be told where
 * their midnight falls. This is the pure half of that contract: turning what a
 * client sent into minutes, or refusing it.
 */
describe("reading a Learner's UTC offset", () => {
  it("reads a whole-hour offset either side of UTC", () => {
    expect(parseUtcOffsetMinutes("60")).toBe(60);
    expect(parseUtcOffsetMinutes("-300")).toBe(-300);
    expect(parseUtcOffsetMinutes("+120")).toBe(120);
  });

  it("reads the offsets that are not whole hours", () => {
    expect(parseUtcOffsetMinutes("345")).toBe(345);
    expect(parseUtcOffsetMinutes("-210")).toBe(-210);
  });

  it("treats an absent offset as UTC rather than failing", () => {
    expect(parseUtcOffsetMinutes(undefined)).toBe(0);
    expect(parseUtcOffsetMinutes(null)).toBe(0);
    expect(parseUtcOffsetMinutes("")).toBe(0);
    expect(parseUtcOffsetMinutes("   ")).toBe(0);
  });

  it("reads UTC itself as an offset a client deliberately sent", () => {
    expect(parseUtcOffsetMinutes("0")).toBe(0);
  });

  it("accepts the whole range of real offsets and nothing beyond it", () => {
    expect(parseUtcOffsetMinutes(String(MIN_UTC_OFFSET_MINUTES))).toBe(MIN_UTC_OFFSET_MINUTES);
    expect(parseUtcOffsetMinutes(String(MAX_UTC_OFFSET_MINUTES))).toBe(MAX_UTC_OFFSET_MINUTES);
    expect(() => parseUtcOffsetMinutes(String(MIN_UTC_OFFSET_MINUTES - 1))).toThrow(/offset/i);
    expect(() => parseUtcOffsetMinutes(String(MAX_UTC_OFFSET_MINUTES + 1))).toThrow(/offset/i);
  });

  it("refuses a value that is not a whole number of minutes", () => {
    expect(() => parseUtcOffsetMinutes("60.5")).toThrow(/offset/i);
    expect(() => parseUtcOffsetMinutes("abc")).toThrow(/offset/i);
    expect(() => parseUtcOffsetMinutes("0x10")).toThrow(/offset/i);
    expect(() => parseUtcOffsetMinutes("60,")).toThrow(/offset/i);
  });

  it("offers a client the header to send, read from the machine it runs on", () => {
    expect(currentUtcOffsetHeader()).toEqual({ [UTC_OFFSET_HEADER]: String(-new Date().getTimezoneOffset()) });
    expect(parseUtcOffsetMinutes(currentUtcOffsetHeader()[UTC_OFFSET_HEADER])).toBe(-new Date().getTimezoneOffset());
  });
});
