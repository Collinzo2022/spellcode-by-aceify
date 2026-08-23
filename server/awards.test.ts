import { describe, expect, it } from "vitest";
import { awardProgress, AWARD_CATALOG, verifiedAwards } from "../shared/awards";
import { BEGINNER_BUILD_MISSIONS, checkBeginnerBuildMission } from "../shared/beginnerModule";
import * as awardsModule from "../shared/awards";
import * as curriculumModule from "../shared/curriculum";
import * as progressModule from "../shared/progress";

const emptySnapshot = { xp: 0, currentStreak: 0, completedLessonSlugs: [], passedChallengeCount: 0, completedDailyCount: 0, completedProjectCount: 0, completedBeginnerBuildMissionCount: 0 };

describe("verified SpellCode awards", () => {
  it("describes the Pathfinder criterion in terms of the lessons it measures", () => {
    const pathfinder = AWARD_CATALOG.find(award => award.slug === "pathfinder")!;
    expect(pathfinder.criterion).toMatch(/lessons/i);
  });

  it("reserves the word mission for Beginner Build Lab awards only", () => {
    // CONTEXT.md: a Mission is never a Lesson, Challenge, Daily Task or Project.
    // Launchpad is the only award that measures Beginner Build Lab missions, so
    // it is the only one whose copy may use the word.
    const copyOf = (award: (typeof AWARD_CATALOG)[number]) => `${award.name} ${award.description} ${award.criterion}`;
    const awardsSayingMission = AWARD_CATALOG.filter(award => /mission/i.test(copyOf(award))).map(award => award.slug);

    expect(new Set(awardsSayingMission)).toEqual(new Set(["launchpad"]));
  });

  it("never calls an Award a badge or an achievement", () => {
    const copy = AWARD_CATALOG.map(award => `${award.name} ${award.description} ${award.criterion}`).join(" ");

    expect(copy).not.toMatch(/badge|achievement/i);
  });

  it("exports no shared identifier named with retired recognition vocabulary", () => {
    // Copy alone is not enough of a guard: an `AWARD_CATALOG as ACHIEVEMENTS`
    // re-export survived the ticket 03 sweep because nothing looked at names.
    const exported = [awardsModule, curriculumModule, progressModule].flatMap(module => Object.keys(module));

    expect(exported.filter(name => /achievement|badge/i.test(name))).toEqual([]);
  });

  it("identifies every award by a stable award slug", () => {
    expect(AWARD_CATALOG.every(award => typeof award.slug === "string" && award.slug.length > 0)).toBe(true);
    expect(new Set(AWARD_CATALOG.map(award => award.slug)).size).toBe(AWARD_CATALOG.length);
  });

  it("only unlocks a beginner path award when all three real mission lessons are complete", () => {
    const pathfinder = AWARD_CATALOG.find(award => award.slug === "pathfinder")!;
    expect(awardProgress(pathfinder, { ...emptySnapshot, completedLessonSlugs: ["html-foundations", "html-semantic-layout"] })).toMatchObject({ current: 2, target: 3, earned: false });
    expect(awardProgress(pathfinder, { ...emptySnapshot, completedLessonSlugs: ["html-foundations", "html-semantic-layout", "css-visual-language"] })).toMatchObject({ current: 3, target: 3, earned: true });
  });

  it("reports no earned awards for a learner with no verifiable activity", () => {
    expect(verifiedAwards(emptySnapshot).filter(award => award.earned)).toHaveLength(0);
  });

  it("checks beginner build steps using required fragments rather than a client-side completion toggle", () => {
    const mission = BEGINNER_BUILD_MISSIONS[2]!;
    expect(checkBeginnerBuildMission(mission, "<main><h1>Hi</h1><p>Build</p><button>Go</button></main>")).toMatchObject({ passed: true, score: 100 });
    expect(checkBeginnerBuildMission(mission, "<main><h1>Hi</h1></main>")).toMatchObject({ passed: false, missing: ["<p", "<button"] });
  });
});
