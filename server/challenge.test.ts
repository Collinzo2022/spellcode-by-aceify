import { describe, expect, it } from "vitest";
import { validateChallenge } from "../client/src/lib/challenge";

describe("challenge validation", () => {
  it("passes when every required code fragment is present", () => {
    expect(validateChallenge(["<main", "<h1", "<p"], "<main><h1>Hi</h1><p>Welcome</p></main>")).toEqual({ passed: true, score: 100, missing: [] });
  });

  it("returns the missing requirement and partial score", () => {
    expect(validateChallenge(["display: flex", "gap"], ".cards { display: flex; }")).toEqual({ passed: false, score: 50, missing: ["gap"] });
  });
});
