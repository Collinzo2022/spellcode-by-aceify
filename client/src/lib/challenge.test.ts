import { describe, expect, it } from "vitest";
import { validateChallenge } from "./challenge";

describe("validateChallenge", () => {
  it("passes when every required code fragment is present", () => {
    expect(validateChallenge(["<main", "<h1", "<p"], "<main><h1>Hi</h1><p>Welcome</p></main>")).toEqual({ passed: true, score: 100, missing: [] });
  });

  it("reports required fragments that are still missing", () => {
    expect(validateChallenge(["display: flex", "gap"], ".cards { display: flex; }")).toEqual({ passed: false, score: 50, missing: ["gap"] });
  });
});
