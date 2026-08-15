import { describe, expect, it } from "vitest";
import { CURRICULUM, DIFFICULTIES, PROJECTS, TRACKS } from "../shared/curriculum";

describe("SpellCode by Aceify curriculum", () => {
  it("uses the exact required tracks and difficulty labels", () => {
    expect(TRACKS).toEqual(["HTML", "CSS", "JavaScript"]);
    expect(DIFFICULTIES).toEqual(["Beginner", "Intermediate", "Advanced"]);
  });

  it("contains learning content and the required mini-project references", () => {
    expect(CURRICULUM.every(track => track.lessons.length > 0)).toBe(true);
    expect(PROJECTS.map(project => project.id)).toEqual(expect.arrayContaining(["landing-page", "calculator"]));
  });
});

