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
  /** Stable, human-readable identifier for an Award. Never a database UUID. */
  slug: string;
  name: string;
  description: string;
  criterion: string;
  iconKey: "spark" | "code" | "flame" | "star" | "hammer" | "compass";
  progress: (snapshot: AwardMetricSnapshot) => { current: number; target: number };
};

const hasLesson = (snapshot: AwardMetricSnapshot, slug: string) => snapshot.completedLessonSlugs.includes(slug) ? 1 : 0;

export const AWARD_CATALOG: AwardDefinition[] = [
  { slug: "first-spark", name: "First Spark", description: "Your first verified lesson completion.", criterion: "Complete any lesson.", iconKey: "spark", progress: snapshot => ({ current: Math.min(snapshot.completedLessonSlugs.length, 1), target: 1 }) },
  { slug: "launchpad", name: "Launchpad", description: "Turn your first guided build into a working mini webpage.", criterion: "Clear all 3 Beginner Build Lab missions.", iconKey: "compass", progress: snapshot => ({ current: Math.min(snapshot.completedBeginnerBuildMissionCount, 3), target: 3 }) },
  { slug: "code-checker", name: "Code Checker", description: "Turn a real coding attempt into a passed check.", criterion: "Pass one coding challenge.", iconKey: "code", progress: snapshot => ({ current: Math.min(snapshot.passedChallengeCount, 1), target: 1 }) },
  { slug: "daily-rhythm", name: "Daily Rhythm", description: "Build a short, consistent practice habit.", criterion: "Complete the daily task 3 days running.", iconKey: "flame", progress: snapshot => ({ current: Math.min(snapshot.currentStreak, 3), target: 3 }) },
  { slug: "steady-hand", name: "Steady Hand", description: "Accumulate skill through focused practice.", criterion: "Earn 200 XP.", iconKey: "star", progress: snapshot => ({ current: Math.min(snapshot.xp, 200), target: 200 }) },
  { slug: "pathfinder", name: "Pathfinder", description: "Finish the complete beginner web-building sequence.", criterion: "Complete the first three HTML and CSS lessons.", iconKey: "compass", progress: snapshot => ({ current: ["html-foundations", "html-semantic-layout", "css-visual-language"].filter(slug => hasLesson(snapshot, slug)).length, target: 3 }) },
  { slug: "builder", name: "Builder", description: "Ship your first guided coding project.", criterion: "Complete one guided project.", iconKey: "hammer", progress: snapshot => ({ current: Math.min(snapshot.completedProjectCount, 1), target: 1 }) },
];

export function awardProgress(definition: AwardDefinition, snapshot: AwardMetricSnapshot) {
  const result = definition.progress(snapshot);
  return { ...result, earned: result.current >= result.target };
}

export function verifiedAwards(snapshot: AwardMetricSnapshot) {
  return AWARD_CATALOG.map(definition => ({ ...definition, ...awardProgress(definition, snapshot) }));
}
