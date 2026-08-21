export type AwardMetricSnapshot = {
  xp: number;
  currentStreak: number;
  completedLessonSlugs: string[];
  passedChallengeCount: number;
  completedDailyCount: number;
  completedProjectCount: number;
  completedBeginnerBuildMissionCount: number;
};

export type AwardDefinition = {
  id: string;
  name: string;
  description: string;
  criteria: string;
  iconKey: "spark" | "code" | "flame" | "star" | "hammer" | "compass";
  progress: (snapshot: AwardMetricSnapshot) => { current: number; target: number };
};

const hasLesson = (snapshot: AwardMetricSnapshot, slug: string) => snapshot.completedLessonSlugs.includes(slug) ? 1 : 0;

export const AWARD_CATALOG: AwardDefinition[] = [
  { id: "first-spark", name: "First Spark", description: "Your first verified lesson completion.", criteria: "Complete any lesson.", iconKey: "spark", progress: snapshot => ({ current: Math.min(snapshot.completedLessonSlugs.length, 1), target: 1 }) },
  { id: "launchpad", name: "Launchpad", description: "Turn your first guided build into a working mini webpage.", criteria: "Clear all 3 Beginner Build Lab missions.", iconKey: "compass", progress: snapshot => ({ current: Math.min(snapshot.completedBeginnerBuildMissionCount, 3), target: 3 }) },
  { id: "code-checker", name: "Code Checker", description: "Turn a real coding attempt into a passed check.", criteria: "Pass one coding challenge.", iconKey: "code", progress: snapshot => ({ current: Math.min(snapshot.passedChallengeCount, 1), target: 1 }) },
  { id: "daily-rhythm", name: "Daily Rhythm", description: "Build a short, consistent practice habit.", criteria: "Reach a 3-day learning streak.", iconKey: "flame", progress: snapshot => ({ current: Math.min(snapshot.currentStreak, 3), target: 3 }) },
  { id: "steady-hand", name: "Steady Hand", description: "Accumulate skill through focused practice.", criteria: "Earn 200 XP.", iconKey: "star", progress: snapshot => ({ current: Math.min(snapshot.xp, 200), target: 200 }) },
  { id: "pathfinder", name: "Pathfinder", description: "Finish the complete beginner web-building sequence.", criteria: "Clear the first three HTML and CSS missions.", iconKey: "compass", progress: snapshot => ({ current: ["html-foundations", "html-semantic-layout", "css-visual-language"].filter(slug => hasLesson(snapshot, slug)).length, target: 3 }) },
  { id: "builder", name: "Builder", description: "Ship your first guided coding project.", criteria: "Complete one guided project.", iconKey: "hammer", progress: snapshot => ({ current: Math.min(snapshot.completedProjectCount, 1), target: 1 }) },
];

export function awardProgress(definition: AwardDefinition, snapshot: AwardMetricSnapshot) {
  const result = definition.progress(snapshot);
  return { ...result, earned: result.current >= result.target };
}

export function verifiedAwards(snapshot: AwardMetricSnapshot) {
  return AWARD_CATALOG.map(definition => ({ ...definition, ...awardProgress(definition, snapshot) }));
}
