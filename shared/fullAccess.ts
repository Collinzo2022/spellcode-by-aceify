export function lessonRequiresFullAccess(order: number) {
  return order > 1;
}

export function canIssueCertificate(
  hasFullAccess: boolean,
  completedLessons: number,
  totalLessons: number
) {
  return hasFullAccess && totalLessons > 0 && completedLessons >= totalLessons;
}
