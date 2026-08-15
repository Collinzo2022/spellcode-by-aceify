export type ChallengeResult = { passed: boolean; score: number; missing: string[] };

export function validateChallenge(required: string[], source: string): ChallengeResult {
  const normalizedSource = source.toLowerCase();
  const missing = required.filter(item => !normalizedSource.includes(item.toLowerCase()));
  const score = Math.round(((required.length - missing.length) / required.length) * 100);
  return { passed: missing.length === 0, score, missing };
}
