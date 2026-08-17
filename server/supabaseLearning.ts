import { CURRICULUM, type LessonDefinition } from "../shared/curriculum";
import { supabaseAdminRequest } from "./supabase";

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
  return { tracks: trackMap, lessons: storedLessons };
}

export async function getVerifiedEntitlements(userId: string) {
  const subscriptions = await supabaseAdminRequest<Array<{ plan_id: string; status: string; current_period_end: string | null }>>(`/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=plan_id,status,current_period_end`);
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

export async function getDailyLearningOverview(userId: string) {
  const task = await ensureTodayTask();
  const entitlement = await getVerifiedEntitlements(userId);
  const completion = await supabaseAdminRequest<CompletionRow[]>(`/rest/v1/daily_task_completions?user_id=eq.${encodeURIComponent(userId)}&daily_task_id=eq.${task.id}&select=state,xp_earned,completed_at`);
  const profile = await supabaseAdminRequest<ProfileRow[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,xp,current_streak,longest_streak,last_learning_at`);
  return { task, completion: completion[0] ?? { state: "not_started", xp_earned: 0, completed_at: null }, profile: profile[0] ?? { id: userId, xp: 0, current_streak: 0, longest_streak: 0, last_learning_at: null }, hasPaidAccess: entitlement.hasFullAccess, entitlements: entitlement.features, locked: Boolean(task.required_plan_code && !entitlement.hasFullAccess) };
}

export async function completeDailyLearningTask(userId: string, input: { score: number; submittedCode?: { html?: string; css?: string; javascript?: string } }) {
  const overview = await getDailyLearningOverview(userId);
  if (overview.locked) throw new Error("This daily task is part of Full Access. Choose a plan to continue.");
  if (overview.completion.state === "completed") return { alreadyCompleted: true, awardedXp: 0, streak: overview.profile.current_streak };
  const today = dayKey(); const lastDay = overview.profile.last_learning_at?.slice(0, 10); const yesterday = dayKey(new Date(Date.now() - DAY_MS));
  const nextStreak = lastDay === yesterday ? overview.profile.current_streak + 1 : 1;
  const nextXp = overview.profile.xp + overview.task.xp_reward;
  await supabaseAdminRequest(`/rest/v1/daily_task_completions?on_conflict=user_id,daily_task_id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: userId, daily_task_id: overview.task.id, state: "completed", score: input.score, xp_earned: overview.task.xp_reward, completed_at: new Date().toISOString() }) });
  await supabaseAdminRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ xp: nextXp, current_streak: nextStreak, longest_streak: Math.max(overview.profile.longest_streak, nextStreak), last_learning_at: `${today}T12:00:00.000Z`, updated_at: new Date().toISOString() }) });
  await supabaseAdminRequest("/rest/v1/activity_events", { method: "POST", body: JSON.stringify({ user_id: userId, event_type: "daily_task", title: "Daily task completed", detail: `Completed ${overview.task.title}.`, metadata: { daily_task_id: overview.task.id, score: input.score, submitted_code: input.submittedCode ?? {} } }) });
  return { alreadyCompleted: false, awardedXp: overview.task.xp_reward, streak: nextStreak };
}

type EnrollmentRow = { id: string; track_id: string };
type ProgressRow = { id: string; lesson_id: string; state: "not_started" | "in_progress" | "completed"; xp_earned: number };
type ActivityRow = { id: string; event_type: string; title: string; detail: string | null; created_at: string };
type AchievementRow = { id: string; slug: string };
type UserAchievementRow = { achievement_id: string };

async function addActivity(userId: string, eventType: string, title: string, detail: string, metadata: Record<string, unknown> = {}) {
  await supabaseAdminRequest("/rest/v1/activity_events", { method: "POST", body: JSON.stringify({ user_id: userId, event_type: eventType, title, detail, metadata }) });
}

async function addXp(userId: string, amount: number) {
  const profiles = await supabaseAdminRequest<Array<{ xp: number; current_streak: number; longest_streak: number }>>(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=xp,current_streak,longest_streak&limit=1`);
  const profile = profiles[0] ?? { xp: 0, current_streak: 0, longest_streak: 0 };
  await supabaseAdminRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", body: JSON.stringify({ xp: profile.xp + amount, current_streak: Math.max(profile.current_streak, 1), longest_streak: Math.max(profile.longest_streak, 1), updated_at: new Date().toISOString() }) });
}

async function awardAchievement(userId: string, slug: string) {
  const achievements = await supabaseAdminRequest<AchievementRow[]>(`/rest/v1/achievements?slug=eq.${encodeURIComponent(slug)}&select=id,slug&limit=1`);
  const achievement = achievements[0];
  if (!achievement) return;
  await supabaseAdminRequest("/rest/v1/user_achievements?on_conflict=user_id,achievement_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ user_id: userId, achievement_id: achievement.id }) });
}

export async function getSupabaseLearnerDashboard(userId: string) {
  const { tracks, lessons } = await ensureSupabaseCurriculum();
  const [profiles, enrollments, progress, activity, userAchievements] = await Promise.all([
    supabaseAdminRequest<ProfileRow[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,xp,current_streak,longest_streak,last_learning_at&limit=1`),
    supabaseAdminRequest<EnrollmentRow[]>(`/rest/v1/enrollments?user_id=eq.${encodeURIComponent(userId)}&select=id,track_id`),
    supabaseAdminRequest<ProgressRow[]>(`/rest/v1/lesson_progress?user_id=eq.${encodeURIComponent(userId)}&select=id,lesson_id,state,xp_earned`),
    supabaseAdminRequest<ActivityRow[]>(`/rest/v1/activity_events?user_id=eq.${encodeURIComponent(userId)}&select=id,event_type,title,detail,created_at&order=created_at.desc&limit=6`),
    supabaseAdminRequest<UserAchievementRow[]>(`/rest/v1/user_achievements?user_id=eq.${encodeURIComponent(userId)}&select=achievement_id`),
  ]);
  const profile = profiles[0] ?? { id: userId, xp: 0, current_streak: 0, longest_streak: 0, last_learning_at: null };
  const lessonById = new Map(lessons.map(lesson => [lesson.id, lesson]));
  const trackById = new Map(Array.from(tracks.values()).map(track => [track.id, track]));
  const completedLessons = progress.filter(item => item.state === "completed").length;
  const achievementIds = userAchievements.map(item => item.achievement_id);
  const achievements = achievementIds.length ? await supabaseAdminRequest<AchievementRow[]>(`/rest/v1/achievements?id=in.(${achievementIds.join(",")})&select=id,slug`) : [];
  return {
    stats: { xp: profile.xp, streak: profile.current_streak, completedLessons },
    progress: progress.map(item => {
      const lesson = lessonById.get(item.lesson_id);
      const track = lesson ? trackById.get(lesson.track_id) : undefined;
      return { id: item.id, lessonId: lesson?.slug ?? item.lesson_id, track: track?.name ?? "HTML", difficulty: lesson?.difficulty ?? "Beginner", status: item.state === "completed" ? "completed" : "in_progress", xpEarned: item.xp_earned };
    }),
    activity: activity.map(item => ({ id: item.id, type: item.event_type, title: item.title, detail: item.detail ?? "" })),
    achievements: achievements.map(item => ({ achievementId: item.slug })),
    enrollments: enrollments.map(item => ({ id: item.id, trackId: trackById.get(item.track_id)?.slug ?? item.track_id })),
  };
}

export async function enrollSupabaseTrack(userId: string, trackSlug: string) {
  const { tracks } = await ensureSupabaseCurriculum();
  const track = tracks.get(trackSlug);
  if (!track) throw new Error("Unknown track");
  await supabaseAdminRequest("/rest/v1/enrollments?on_conflict=user_id,track_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ user_id: userId, track_id: track.id }) });
  await addActivity(userId, "enrollment", "Track added", `Added the ${track.name} track to your learning path.`, { track_slug: trackSlug });
  return { enrolled: true, trackId: trackSlug };
}

export async function completeSupabaseLesson(userId: string, input: { lessonId: string; track: "HTML" | "CSS" | "JavaScript"; difficulty: "Beginner" | "Intermediate" | "Advanced"; xp: number }) {
  const { lessons } = await ensureSupabaseCurriculum();
  const lesson = lessons.find(item => item.slug === input.lessonId);
  if (!lesson) throw new Error("Lesson is not available yet");
  const existing = await supabaseAdminRequest<Array<{ state: string }>>(`/rest/v1/lesson_progress?user_id=eq.${encodeURIComponent(userId)}&lesson_id=eq.${lesson.id}&select=state&limit=1`);
  const isNewCompletion = existing[0]?.state !== "completed";
  await supabaseAdminRequest("/rest/v1/lesson_progress?on_conflict=user_id,lesson_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: userId, lesson_id: lesson.id, state: "completed", score: 100, xp_earned: input.xp, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
  if (isNewCompletion) {
    await addXp(userId, input.xp);
    await addActivity(userId, "lesson", "Lesson completed", `Completed ${input.lessonId.replace(/-/g, " ")}.`, { lesson_slug: input.lessonId });
    await awardAchievement(userId, "first-spark");
  }
  return { completed: true, isNewCompletion, awardedXp: isNewCompletion ? input.xp : 0 };
}

export async function recordSupabaseChallengeAttempt(userId: string, input: { challengeId: string; score: number; passed: boolean; summary: string }) {
  const { lessons } = await ensureSupabaseCurriculum();
  const lesson = lessons.find(item => item.slug === input.challengeId);
  if (!lesson) throw new Error("Challenge is not available yet");
  const challenges = await supabaseAdminRequest<Array<{ id: string }>>(`/rest/v1/challenges?lesson_id=eq.${lesson.id}&select=id&limit=1`);
  const challenge = challenges[0];
  if (!challenge) throw new Error("Challenge is not available yet");
  const awardedXp = input.passed ? 20 : 0;
  await supabaseAdminRequest("/rest/v1/challenge_attempts", { method: "POST", body: JSON.stringify({ user_id: userId, challenge_id: challenge.id, score: input.score, passed: input.passed, feedback: { summary: input.summary } }) });
  await addActivity(userId, "challenge", input.passed ? "Challenge passed" : "Challenge attempted", input.summary, { lesson_slug: input.challengeId, score: input.score });
  if (awardedXp) await addXp(userId, awardedXp);
  return { saved: true, awardedXp };
}

export async function recordSupabaseProjectCompletion(userId: string, input: { projectId: string; title: string }) {
  const awardedXp = 100;
  await addXp(userId, awardedXp);
  await addActivity(userId, "project", "Project completed", `Completed the ${input.title} project.`, { project_slug: input.projectId });
  await awardAchievement(userId, "builder");
  return { saved: true, projectId: input.projectId, awardedXp };
}
