export type PaidFeature = "advanced_lessons" | "project_publishing" | "ai_tutor" | "certificate";

export function canUsePaidFeature(hasFullAccess: boolean, _feature: PaidFeature) {
  return hasFullAccess;
}

export function lessonRequiresFullAccess(order: number) {
  return order > 1;
}

export function canIssueCertificate(hasFullAccess: boolean, completedLessons: number, totalLessons: number) {
  return hasFullAccess && totalLessons > 0 && completedLessons >= totalLessons;
}
