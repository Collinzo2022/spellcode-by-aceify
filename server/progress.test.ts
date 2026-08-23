import { describe, expect, it } from "vitest";
import { applyLessonCompletion, challengeOutcome, lessonCompletionOutcome, projectCompletionOutcome } from "../shared/progress";

describe("learner progress rules", () => {
  it("awards a lesson only the first time it is completed", () => {
    const firstOutcome = lessonCompletionOutcome(false, 75);
    expect(firstOutcome).toEqual({ awardedXp: 75, shouldRecordActivity: true, shouldAwardFirstLesson: true });
    expect(applyLessonCompletion({ xp: 20, completedLessons: 1, streak: 0 }, firstOutcome)).toEqual({ xp: 95, completedLessons: 2, streak: 1 });
    expect(lessonCompletionOutcome(true, 75)).toEqual({ awardedXp: 0, shouldRecordActivity: false, shouldAwardFirstLesson: false });
  });

  it("awards challenge XP only when validation passes", () => {
    expect(challengeOutcome(true)).toEqual({ awardedXp: 20, status: "passed" });
    expect(challengeOutcome(false)).toEqual({ awardedXp: 0, status: "needs_revision" });
  });

  it("awards the Builder award and XP when a guided project is completed", () => {
    expect(projectCompletionOutcome()).toEqual({ awardedXp: 100, awardSlug: "builder" });
  });
});
