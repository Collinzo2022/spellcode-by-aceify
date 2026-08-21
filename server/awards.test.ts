import { describe, expect, it } from "vitest";
import { awardProgress, AWARD_CATALOG, verifiedAwards } from "../shared/awards";
import { BEGINNER_BUILD_MISSIONS, checkBeginnerBuildMission } from "../shared/beginnerModule";

const emptySnapshot = { xp: 0, currentStreak: 0, completedLessonSlugs: [], passedChallengeCount: 0, completedDailyCount: 0, completedProjectCount: 0, completedBeginnerBuildMissionCount: 0 };

describe("verified SpellCode awards", () => {
  it("only unlocks a beginner path award when all three real mission lessons are complete", () => {
    const pathfinder = AWARD_CATALOG.find(award => award.id === "pathfinder")!;
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
