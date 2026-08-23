import { CURRICULUM, type LessonDefinition } from "../shared/curriculum";
import { supabaseAdminRequest } from "./supabase";
import { AWARD_CATALOG, verifiedAwards, type AwardMetricSnapshot } from "../shared/awards";
import { BEGINNER_BUILD_MISSIONS, checkBeginnerBuildMission } from "../shared/beginnerModule";

type TrackRow = { id: string; slug: string; name: string; color_hex: string | null };
type LessonRow = { id: string; slug: string; title: string; difficulty: "Beginner" | "Intermediate" | "Advanced"; duration_minutes: number; xp_reward: number; description: string; theory_markdown: string; example_code: { code?: string }; track_id: string };
type DailyTaskRow = { id: string; task_date: string; title: string; description: string; difficulty: "Beginner" | "Intermediate" | "Advanced"; xp_reward: number; estimated_minutes: number; task_content: { prompt?: string; required?: string[]; hint?: string; lesson_slug?: string; track_slug?: string }; required_plan_code: string | null; lesson_id: string | null };
type ProfileRow = { id: string; xp: number; current_streak: number; longest_streak: number; last_learning_at: string | null };
type CompletionRow = { state: "not_started" | "in_progress" | "completed"; xp_earned: number; completed_at: string | null };

const DAY_MS = 86_400_000;
const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

function minuteCount(duration: string) { const count = Number.parseInt(duration, 10); return Number.isFinite(count) ? count : 12; }

function lessonSeed(track: typeof CURRICULUM[number], lesson: LessonDefinition, trackId: string) {
  return { track_id: trackId, slug: lesson.id, title: lesson.title, description: lesson.description, difficulty: lesson.difficulty, sort_order: lesson.order, duration_minutes: minuteCount(lesson.duration), xp_reward: lesson.xp, theory_markdown: lesson.theory, example_code: { code: lesson.example }, is_published: true };
}

export async function ensureSupabaseCurriculum() {
  const trackPayload = CURRICULUM.map(track => ({ slug: track.id, name: track.name, description: track.description, color_hex: track.color, is_published: true }));
  await supabaseAdminRequest<TrackRow[]>("/rest/v1/tracks?on_conflict=slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(trackPayload) });
  const tracks = await supabaseAdminRequest<TrackRow[]>("/rest/v1/tracks?select=id,slug,name,color_hex");
  const trackMap = new Map(tracks.map(track => [track.slug, track]));
  const lessons = CURRICULUM.flatMap(track => track.lessons.map(lesson => lessonSeed(track, lesson, trackMap.get(track.id)!.id)));
  await supabaseAdminRequest<LessonRow[]>("/rest/v1/lessons?on_conflict=track_id,slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(lessons) });
  const storedLessons = await supabaseAdminRequest<LessonRow[]>("/rest/v1/lessons?select=id,slug,track_id,title,difficulty,duration_minutes,xp_reward,description,theory_markdown,example_code");
  const lessonMap = new Map(storedLessons.map(lesson => [`${lesson.track_id}:${lesson.slug}`, lesson]));
  const challenges = CURRICULUM.flatMap(track => track.lessons.map(lesson => { const stored = lessonMap.get(`${trackMap.get(track.id)!.id}:${lesson.id}`)!; return { lesson_id: stored.id, prompt: lesson.challenge.prompt, required_fragments: lesson.challenge.required, hint_nudge: lesson.challenge.hint, hint_detail: "Work through the required elements one at a time, then compare the structure with the guided example.", reference_solution: { code: lesson.example } }; }));
  await supabaseAdminRequest("/rest/v1/challenges?on_conflict=lesson_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(challenges) });
  await supabaseAdminRequest("/rest/v1/achievements?on_conflict=slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(AWARD_CATALOG.map(award => ({ slug: award.slug, name: award.name, description: award.description, icon_key: award.iconKey }))) });
  return { tracks: trackMap, lessons: storedLessons };
}

export async function getVerifiedEntitlements(learnerId: string) {
  const subscriptions = await supabaseAdminRequest<Array<{ plan_id: string; status: string; current_period_end: string | null }>>(`/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(learnerId)}&status=eq.active&select=plan_id,status,current_period_end`);
  const now = Date.now();
  const activePlans = subscriptions.filter(subscription => !subscription.current_period_end || new Date(subscription.current_period_end).getTime() >= now).map(subscription => subscription.plan_id);
  if (activePlans.length === 0) return { hasFullAccess: false, features: [] as string[] };
  const plans = await supabaseAdminRequest<Array<{ id: string; paid_features: string[] }>>(`/rest/v1/plans?id=in.(${activePlans.join(",")})&select=id,paid_features`);
  return { hasFullAccess: plans.length > 0, features: Array.from(new Set(plans.flatMap(plan => plan.paid_features ?? []))) };
}

async function ensureTodayTask() {
  const today = dayKey();
  const existing = await supabaseAdminRequest<DailyTaskRow[]>(`/rest/v1/daily_tasks?task_date=eq.${today}&select=id,task_date,title,description,difficulty,xp_reward,estimated_minutes,task_content,required_plan_code,lesson_id`);
  if (existing[0]) return existing[0];
  const { tracks, lessons } = await ensureSupabaseCurriculum();
  const allLessons = CURRICULUM.flatMap(track => track.lessons.map(lesson => ({ track, lesson })));
  const index = Math.floor(new Date(`${today}T00:00:00.000Z`).getTime() / DAY_MS) % allLessons.length;
  const selected = allLessons[index];
  const storedTrack = tracks.get(selected.track.id)!;
  const storedLesson = lessons.find(item => item.track_id === storedTrack.id && item.slug === selected.lesson.id)!;
  const payload = { task_date: today, title: `Today: ${selected.lesson.title}`, description: selected.lesson.objective, track_id: storedTrack.id, lesson_id: storedLesson.id, difficulty: selected.lesson.difficulty, xp_reward: Math.max(25, Math.round(selected.lesson.xp / 2)), estimated_minutes: Math.min(20, minuteCount(selected.lesson.duration)), task_content: { prompt: selected.lesson.challenge.prompt, required: selected.lesson.challenge.required, hint: selected.lesson.challenge.hint, lesson_slug: selected.lesson.id, track_slug: selected.track.id }, required_plan_code: selected.lesson.order > 1 ? "full-access-one-time" : null, published_at: new Date().toISOString() };
  const created = await supabaseAdminRequest<DailyTaskRow[]>("/rest/v1/daily_tasks", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
  return created[0];
}

export async function getDailyLearningOverview(learnerId: string) {
  const task = await ensureTodayTask();
  const entitlement = await getVerifiedEntitlements(learnerId);
  const completion = await supabaseAdminRequest<CompletionRow[]>(`/rest/v1/daily_task_completions?user_id=eq.${encodeURIComponent(learnerId)}&daily_task_id=eq.${task.id}&select=state,xp_earned,completed_at`);
  const profile = await supabaseAdminRequest<ProfileRow[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}&select=id,xp,current_streak,longest_streak,last_learning_at`);
  return { task, completion: completion[0] ?? { state: "not_started", xp_earned: 0, completed_at: null }, profile: profile[0] ?? { id: learnerId, xp: 0, current_streak: 0, longest_streak: 0, last_learning_at: null }, hasPaidAccess: entitlement.hasFullAccess, entitlements: entitlement.features, locked: Boolean(task.required_plan_code && !entitlement.hasFullAccess) };
}

export async function completeDailyLearningTask(learnerId: string, input: { score: number; submittedCode?: { html?: string; css?: string; javascript?: string } }) {
  const overview = await getDailyLearningOverview(learnerId);
  if (overview.locked) throw new Error("This daily task is part of Full Access. Choose a plan to continue.");
  if (overview.completion.state === "completed") return { alreadyCompleted: true, awardedXp: 0, streak: overview.profile.current_streak };
  const today = dayKey(); const lastDay = overview.profile.last_learning_at?.slice(0, 10); const yesterday = dayKey(new Date(Date.now() - DAY_MS));
  const nextStreak = lastDay === yesterday ? overview.profile.current_streak + 1 : 1;
  const nextXp = overview.profile.xp + overview.task.xp_reward;
  await supabaseAdminRequest(`/rest/v1/daily_task_completions?on_conflict=user_id,daily_task_id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: learnerId, daily_task_id: overview.task.id, state: "completed", score: input.score, xp_earned: overview.task.xp_reward, completed_at: new Date().toISOString() }) });
  await supabaseAdminRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ xp: nextXp, current_streak: nextStreak, longest_streak: Math.max(overview.profile.longest_streak, nextStreak), last_learning_at: `${today}T12:00:00.000Z`, updated_at: new Date().toISOString() }) });
  await supabaseAdminRequest("/rest/v1/activity_events", { method: "POST", body: JSON.stringify({ user_id: learnerId, event_type: "daily_task", title: "Daily task completed", detail: `Completed ${overview.task.title}.`, metadata: { daily_task_id: overview.task.id, score: input.score, submitted_code: input.submittedCode ?? {} } }) });
  const newAwards = await reconcileVerifiedAwards(learnerId);
  return { alreadyCompleted: false, awardedXp: overview.task.xp_reward, streak: nextStreak, newAwards: newAwards.map(award => ({ awardSlug: award.slug, name: award.name })) };
}

type EnrollmentRow = { id: string; track_id: string };
type ProgressRow = { id: string; lesson_id: string; state: "not_started" | "in_progress" | "completed"; xp_earned: number };
type ActivityRow = { id: string; event_type: string; title: string; detail: string | null; created_at: string };
type AchievementRow = { id: string; slug: string; name: string; description: string; icon_key: string | null };
type UserAchievementRow = { achievement_id: string };

async function addActivity(learnerId: string, eventType: string, title: string, detail: string, metadata: Record<string, unknown> = {}) {
  await supabaseAdminRequest("/rest/v1/activity_events", { method: "POST", body: JSON.stringify({ user_id: learnerId, event_type: eventType, title, detail, metadata }) });
}

async function addXp(learnerId: string, amount: number) {
  const profiles = await supabaseAdminRequest<Array<{ xp: number; current_streak: number; longest_streak: number }>>(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}&select=xp,current_streak,longest_streak&limit=1`);
  const profile = profiles[0] ?? { xp: 0, current_streak: 0, longest_streak: 0 };
  await supabaseAdminRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}`, { method: "PATCH", body: JSON.stringify({ xp: profile.xp + amount, current_streak: Math.max(profile.current_streak, 1), longest_streak: Math.max(profile.longest_streak, 1), updated_at: new Date().toISOString() }) });
}

async function recordEarnedAward(learnerId: string, slug: string) {
  const achievements = await supabaseAdminRequest<AchievementRow[]>(`/rest/v1/achievements?slug=eq.${encodeURIComponent(slug)}&select=id,slug,name,description,icon_key&limit=1`);
  const achievement = achievements[0];
  if (!achievement) return undefined;
  const created = await supabaseAdminRequest<UserAchievementRow[]>("/rest/v1/user_achievements?on_conflict=user_id,achievement_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ user_id: learnerId, achievement_id: achievement.id }) });
  return created.length ? achievement : undefined;
}

async function getAwardSnapshot(learnerId: string): Promise<AwardMetricSnapshot> {
  const { lessons } = await ensureSupabaseCurriculum();
  const [profiles, progress, passedChallenges, dailyCompletions, projectActivity, beginnerModuleActivity] = await Promise.all([
    supabaseAdminRequest<ProfileRow[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}&select=id,xp,current_streak,longest_streak,last_learning_at&limit=1`),
    supabaseAdminRequest<Array<{ lesson_id: string }>>(`/rest/v1/lesson_progress?user_id=eq.${encodeURIComponent(learnerId)}&state=eq.completed&select=lesson_id`),
    supabaseAdminRequest<Array<{ id: string }>>(`/rest/v1/challenge_attempts?user_id=eq.${encodeURIComponent(learnerId)}&passed=eq.true&select=id`),
    supabaseAdminRequest<Array<{ id: string }>>(`/rest/v1/daily_task_completions?user_id=eq.${encodeURIComponent(learnerId)}&state=eq.completed&select=id`),
    supabaseAdminRequest<Array<{ id: string }>>(`/rest/v1/activity_events?user_id=eq.${encodeURIComponent(learnerId)}&event_type=eq.project&select=id`),
    supabaseAdminRequest<Array<{ id: string; metadata: { module?: string; mission_id?: string } }>>(`/rest/v1/activity_events?user_id=eq.${encodeURIComponent(learnerId)}&event_type=eq.beginner_module&select=id,metadata`),
  ]);
  const lessonById = new Map(lessons.map(lesson => [lesson.id, lesson.slug]));
  const profile = profiles[0] ?? { xp: 0, current_streak: 0 };
  const uniqueBeginnerMissions = new Set(beginnerModuleActivity.filter(item => item.metadata?.module === "beginner-build").map(item => item.metadata?.mission_id).filter((missionId): missionId is string => Boolean(missionId)));
  return { xp: profile.xp, currentStreak: profile.current_streak, completedLessonSlugs: progress.map(item => lessonById.get(item.lesson_id)).filter((slug): slug is string => Boolean(slug)), passedChallengeCount: passedChallenges.length, completedDailyCount: dailyCompletions.length, completedProjectCount: projectActivity.length, completedBeginnerBuildMissionCount: uniqueBeginnerMissions.size };
}

async function reconcileVerifiedAwards(learnerId: string, providedSnapshot?: AwardMetricSnapshot) {
  const snapshot = providedSnapshot ?? await getAwardSnapshot(learnerId);
  const unlocked = [] as AchievementRow[];
  for (const award of verifiedAwards(snapshot).filter(award => award.earned)) {
    const added = await recordEarnedAward(learnerId, award.slug);
    if (added) {
      unlocked.push(added);
      await addActivity(learnerId, "award", "Award unlocked", `Earned the ${added.name} award.`, { award_slug: added.slug });
    }
  }
  return unlocked;
}

export async function getSupabaseLearnerDashboard(learnerId: string) {
  const { tracks, lessons } = await ensureSupabaseCurriculum();
  const awardSnapshot = await getAwardSnapshot(learnerId);
  await reconcileVerifiedAwards(learnerId, awardSnapshot);
  const [profiles, enrollments, progress, activity, userAchievements] = await Promise.all([
    supabaseAdminRequest<ProfileRow[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}&select=id,xp,current_streak,longest_streak,last_learning_at&limit=1`),
    supabaseAdminRequest<EnrollmentRow[]>(`/rest/v1/enrollments?user_id=eq.${encodeURIComponent(learnerId)}&select=id,track_id`),
    supabaseAdminRequest<ProgressRow[]>(`/rest/v1/lesson_progress?user_id=eq.${encodeURIComponent(learnerId)}&select=id,lesson_id,state,xp_earned`),
    supabaseAdminRequest<ActivityRow[]>(`/rest/v1/activity_events?user_id=eq.${encodeURIComponent(learnerId)}&select=id,event_type,title,detail,created_at&order=created_at.desc&limit=6`),
    supabaseAdminRequest<UserAchievementRow[]>(`/rest/v1/user_achievements?user_id=eq.${encodeURIComponent(learnerId)}&select=achievement_id`),
  ]);
  const profile = profiles[0] ?? { id: learnerId, xp: 0, current_streak: 0, longest_streak: 0, last_learning_at: null };
  const lessonById = new Map(lessons.map(lesson => [lesson.id, lesson]));
  const trackById = new Map(Array.from(tracks.values()).map(track => [track.id, track]));
  const completedLessons = progress.filter(item => item.state === "completed").length;
  const achievementIds = new Set(userAchievements.map(item => item.achievement_id));
  const allAchievements = await supabaseAdminRequest<AchievementRow[]>("/rest/v1/achievements?select=id,slug,name,description,icon_key");
  const awardedSlugs = new Set(allAchievements.filter(item => achievementIds.has(item.id)).map(item => item.slug));
  const verifiedAwardCatalog = verifiedAwards(awardSnapshot);
  return {
    stats: { xp: profile.xp, streak: profile.current_streak, completedLessons },
    beginnerModule: { completedMissions: awardSnapshot.completedBeginnerBuildMissionCount, totalMissions: BEGINNER_BUILD_MISSIONS.length },
    progress: progress.map(item => {
      const lesson = lessonById.get(item.lesson_id);
      const track = lesson ? trackById.get(lesson.track_id) : undefined;
      return { id: item.id, lessonId: lesson?.slug ?? item.lesson_id, track: track?.name ?? "HTML", difficulty: lesson?.difficulty ?? "Beginner", status: item.state === "completed" ? "completed" : "in_progress", xpEarned: item.xp_earned };
    }),
    activity: activity.map(item => ({ id: item.id, type: item.event_type, title: item.title, detail: item.detail ?? "" })),
    earnedAwards: verifiedAwardCatalog.filter(item => awardedSlugs.has(item.slug)).map(item => ({ awardSlug: item.slug, name: item.name, description: item.description, criterion: item.criterion, iconKey: item.iconKey, current: item.current, target: item.target, earned: true })),
    nextAwards: verifiedAwardCatalog.filter(item => !awardedSlugs.has(item.slug)).slice(0, 3).map(item => ({ awardSlug: item.slug, name: item.name, description: item.description, criterion: item.criterion, iconKey: item.iconKey, current: item.current, target: item.target })),
    enrollments: enrollments.map(item => ({ id: item.id, trackId: trackById.get(item.track_id)?.slug ?? item.track_id })),
  };
}

export async function enrollSupabaseTrack(learnerId: string, trackSlug: string) {
  const { tracks } = await ensureSupabaseCurriculum();
  const track = tracks.get(trackSlug);
  if (!track) throw new Error("Unknown track");
  await supabaseAdminRequest("/rest/v1/enrollments?on_conflict=user_id,track_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ user_id: learnerId, track_id: track.id }) });
  await addActivity(learnerId, "enrollment", "Track added", `Added the ${track.name} track to your learning path.`, { track_slug: trackSlug });
  return { enrolled: true, trackId: trackSlug };
}

export async function completeSupabaseLesson(learnerId: string, input: { lessonId: string; track: "HTML" | "CSS" | "JavaScript"; difficulty: "Beginner" | "Intermediate" | "Advanced"; xp: number }) {
  const { lessons } = await ensureSupabaseCurriculum();
  const lesson = lessons.find(item => item.slug === input.lessonId);
  if (!lesson) throw new Error("Lesson is not available yet");
  const existing = await supabaseAdminRequest<Array<{ state: string }>>(`/rest/v1/lesson_progress?user_id=eq.${encodeURIComponent(learnerId)}&lesson_id=eq.${lesson.id}&select=state&limit=1`);
  const isNewCompletion = existing[0]?.state !== "completed";
  await supabaseAdminRequest("/rest/v1/lesson_progress?on_conflict=user_id,lesson_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: learnerId, lesson_id: lesson.id, state: "completed", score: 100, xp_earned: input.xp, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
  if (isNewCompletion) {
    await addXp(learnerId, input.xp);
    await addActivity(learnerId, "lesson", "Lesson completed", `Completed ${input.lessonId.replace(/-/g, " ")}.`, { lesson_slug: input.lessonId });
    const newAwards = await reconcileVerifiedAwards(learnerId);
    return { completed: true, isNewCompletion, awardedXp: input.xp, newAwards: newAwards.map(award => ({ awardSlug: award.slug, name: award.name })) };
  }
  return { completed: true, isNewCompletion, awardedXp: 0, newAwards: [] as Array<{ awardSlug: string; name: string }> };
}

export async function recordSupabaseChallengeAttempt(learnerId: string, input: { challengeId: string; score: number; passed: boolean; summary: string }) {
  const { lessons } = await ensureSupabaseCurriculum();
  const lesson = lessons.find(item => item.slug === input.challengeId);
  if (!lesson) throw new Error("Challenge is not available yet");
  const challenges = await supabaseAdminRequest<Array<{ id: string }>>(`/rest/v1/challenges?lesson_id=eq.${lesson.id}&select=id&limit=1`);
  const challenge = challenges[0];
  if (!challenge) throw new Error("Challenge is not available yet");
  const awardedXp = input.passed ? 20 : 0;
  await supabaseAdminRequest("/rest/v1/challenge_attempts", { method: "POST", body: JSON.stringify({ user_id: learnerId, challenge_id: challenge.id, score: input.score, passed: input.passed, feedback: { summary: input.summary } }) });
  await addActivity(learnerId, "challenge", input.passed ? "Challenge passed" : "Challenge attempted", input.summary, { lesson_slug: input.challengeId, score: input.score });
  if (awardedXp) await addXp(learnerId, awardedXp);
  const newAwards = input.passed ? await reconcileVerifiedAwards(learnerId) : [];
  return { saved: true, awardedXp, newAwards: newAwards.map(award => ({ awardSlug: award.slug, name: award.name })) };
}

export async function recordSupabaseProjectCompletion(learnerId: string, input: { projectId: string; title: string }) {
  const awardedXp = 100;
  await addXp(learnerId, awardedXp);
  await addActivity(learnerId, "project", "Project completed", `Completed the ${input.title} project.`, { project_slug: input.projectId });
  const newAwards = await reconcileVerifiedAwards(learnerId);
  return { saved: true, projectId: input.projectId, awardedXp, newAwards: newAwards.map(award => ({ awardSlug: award.slug, name: award.name })) };
}

export async function completeBeginnerBuildMission(learnerId: string, input: { missionId: string; code: string }) {
  const missionIndex = BEGINNER_BUILD_MISSIONS.findIndex(mission => mission.id === input.missionId);
  const mission = BEGINNER_BUILD_MISSIONS[missionIndex];
  if (!mission) throw new Error("This beginner build mission is not available.");
  const check = checkBeginnerBuildMission(mission, input.code);
  if (!check.passed) return { completed: false, score: check.score, missing: check.missing, awardedXp: 0, newAwards: [] as Array<{ awardSlug: string; name: string }> };
  const existingEvents = await supabaseAdminRequest<Array<{ id: string; metadata: { module?: string; mission_id?: string } }>>(`/rest/v1/activity_events?user_id=eq.${encodeURIComponent(learnerId)}&event_type=eq.beginner_module&select=id,metadata`);
  const completedMissionIds = new Set(existingEvents.filter(item => item.metadata?.module === "beginner-build").map(item => item.metadata?.mission_id).filter((id): id is string => Boolean(id)));
  const requiredPrevious = BEGINNER_BUILD_MISSIONS.slice(0, missionIndex).map(item => item.id);
  if (requiredPrevious.some(id => !completedMissionIds.has(id))) throw new Error("Clear the earlier Beginner Build Lab mission before opening this one.");
  if (completedMissionIds.has(mission.id)) return { completed: true, alreadyCompleted: true, score: 100, missing: [] as string[], awardedXp: 0, newAwards: [] as Array<{ awardSlug: string; name: string }> };
  await addXp(learnerId, mission.rewardXp);
  await addActivity(learnerId, "beginner_module", "Beginner Build Lab mission cleared", `Completed ${mission.title}.`, { module: "beginner-build", mission_id: mission.id, score: check.score });
  const newAwards = await reconcileVerifiedAwards(learnerId);
  return { completed: true, alreadyCompleted: false, score: check.score, missing: [] as string[], awardedXp: mission.rewardXp, newAwards: newAwards.map(award => ({ awardSlug: award.slug, name: award.name })) };
}
