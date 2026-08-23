export type LearnerMetricSnapshot = { xp: number; completedLessons: number; streak: number };

export function lessonCompletionOutcome(alreadyCompleted: boolean, lessonXp: number) {
  const awardedXp = alreadyCompleted ? 0 : lessonXp;
  return { awardedXp, shouldRecordActivity: !alreadyCompleted, shouldAwardFirstLesson: !alreadyCompleted };
}

export function challengeOutcome(passed: boolean) {
  return { awardedXp: passed ? 20 : 0, status: passed ? "passed" : "needs_revision" } as const;
}

export function projectCompletionOutcome() {
  return { awardedXp: 100, awardSlug: "builder" } as const;
}

export function applyLessonCompletion(snapshot: LearnerMetricSnapshot, outcome: ReturnType<typeof lessonCompletionOutcome>): LearnerMetricSnapshot {
  if (!outcome.shouldRecordActivity) return snapshot;
  return { xp: snapshot.xp + outcome.awardedXp, completedLessons: snapshot.completedLessons + 1, streak: Math.max(snapshot.streak, 1) };
}
