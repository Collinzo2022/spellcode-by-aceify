import { CURRICULUM, PROJECTS, type LessonDefinition } from "../shared/curriculum";
import { supabaseAdminRequest } from "./supabase";
import { AWARD_CATALOG, verifiedAwards, type AwardMetricSnapshot } from "../shared/awards";
import { BEGINNER_BUILD_MISSIONS, checkBeginnerBuildMission } from "../shared/beginnerModule";
import { deriveStreak, extendStreak } from "../shared/streak";

type TrackRow = { id: string; slug: string; name: string; color_hex: string | null };
type LessonRow = { id: string; slug: string; title: string; difficulty: "Beginner" | "Intermediate" | "Advanced"; duration_minutes: number; xp_reward: number; description: string; theory_markdown: string; example_code: { code?: string }; track_id: string };
type DailyTaskRow = { id: string; task_date: string; title: string; description: string; difficulty: "Beginner" | "Intermediate" | "Advanced"; xp_reward: number; estimated_minutes: number; task_content: { prompt?: string; required?: string[]; hint?: string; lesson_slug?: string; track_slug?: string }; required_plan_code: string | null; lesson_id: string | null };
type ProfileRow = { id: string; xp: number; current_streak: number; longest_streak: number; last_learning_at: string | null; last_learning_day: string | null };
type ProjectRow = { id: string; slug: string };
type MissionRow = { id: string; slug: string };
type CompletionRow = { state: "not_started" | "in_progress" | "completed"; xp_earned: number; completed_at: string | null };

const DAY_MS = 86_400_000;
const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

/**
 * Minutes from a duration written for a Learner: "16 min", "45m", "1h 20m".
 *
 * The fallback is explicit at each call site because it stands for a different
 * thing in each: an unreadable Lesson duration and an unreadable Project
 * duration are not the same guess. Storage requires a positive number either
 * way.
 */
function durationMinutes(duration: string, fallbackMinutes: number) {
  const hours = Number(duration.match(/(\d+)\s*h/)?.[1] ?? 0);
  const minutes = Number(duration.match(/(\d+)\s*m/)?.[1] ?? 0);
  const total = hours * 60 + minutes;
  return total > 0 ? total : fallbackMinutes;
}

function lessonSeed(track: typeof CURRICULUM[number], lesson: LessonDefinition, trackId: string) {
  return { track_id: trackId, slug: lesson.id, title: lesson.title, description: lesson.description, difficulty: lesson.difficulty, sort_order: lesson.order, duration_minutes: durationMinutes(lesson.duration, 12), xp_reward: lesson.xp, theory_markdown: lesson.theory, example_code: { code: lesson.example }, is_published: true };
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
  await supabaseAdminRequest("/rest/v1/awards?on_conflict=slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(AWARD_CATALOG.map(award => ({ slug: award.slug, name: award.name, description: award.description, icon_key: award.iconKey }))) });
  // Projects are seeded for the same reason Lessons are: a Project Completion
  // records which Project it was, and cannot reference a row that never existed.
  const projectPayload = PROJECTS.map(project => ({ slug: project.id, title: project.title, description: project.description, track_id: trackMap.get(project.track.toLowerCase())?.id ?? null, difficulty: project.difficulty, duration_minutes: durationMinutes(project.duration, 60), is_published: true }));
  await supabaseAdminRequest("/rest/v1/projects?on_conflict=slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(projectPayload) });
  const storedProjects = await supabaseAdminRequest<ProjectRow[]>("/rest/v1/projects?select=id,slug");
  // Missions are seeded for the same reason Projects are: a Mission Completion
  // records which Mission it was, and cannot reference a row that never existed.
  // Only the slug and title are stored - a Mission's instruction, starter code
  // and required fragments are curriculum, read from shared/beginnerModule.ts.
  // The order of the three is the order of BEGINNER_BUILD_MISSIONS and is not
  // stored: it is curriculum, and no query sorts by it.
  await supabaseAdminRequest("/rest/v1/missions?on_conflict=slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(BEGINNER_BUILD_MISSIONS.map(mission => ({ slug: mission.id, title: mission.title }))) });
  const storedMissions = await supabaseAdminRequest<MissionRow[]>("/rest/v1/missions?select=id,slug");
  return { tracks: trackMap, lessons: storedLessons, projects: storedProjects, missions: storedMissions };
}

/**
 * Whether a Learner holds Full Access, verified against their subscriptions.
 *
 * Full Access is a single gate (ADR 0001): the answer is one boolean, and no
 * attribute of a Plan narrows it. The Plans are still read, because a
 * subscription naming a Plan that no longer exists grants nothing.
 */
export async function verifyFullAccess(learnerId: string) {
  const subscriptions = await supabaseAdminRequest<Array<{ plan_id: string; status: string; current_period_end: string | null }>>(`/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(learnerId)}&status=eq.active&select=plan_id,status,current_period_end`);
  const now = Date.now();
  const activePlans = subscriptions.filter(subscription => !subscription.current_period_end || new Date(subscription.current_period_end).getTime() >= now).map(subscription => subscription.plan_id);
  if (activePlans.length === 0) return { hasFullAccess: false };
  const plans = await supabaseAdminRequest<Array<{ id: string }>>(`/rest/v1/plans?id=in.(${activePlans.join(",")})&select=id`);
  return { hasFullAccess: plans.length > 0 };
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
  const payload = { task_date: today, title: `Today: ${selected.lesson.title}`, description: selected.lesson.objective, track_id: storedTrack.id, lesson_id: storedLesson.id, difficulty: selected.lesson.difficulty, xp_reward: Math.max(25, Math.round(selected.lesson.xp / 2)), estimated_minutes: Math.min(20, durationMinutes(selected.lesson.duration, 12)), task_content: { prompt: selected.lesson.challenge.prompt, required: selected.lesson.challenge.required, hint: selected.lesson.challenge.hint, lesson_slug: selected.lesson.id, track_slug: selected.track.id }, required_plan_code: selected.lesson.order > 1 ? "full-access-one-time" : null, published_at: new Date().toISOString() };
  const created = await supabaseAdminRequest<DailyTaskRow[]>("/rest/v1/daily_tasks", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
  return created[0];
}

export async function getDailyLearningOverview(learnerId: string, offsetMinutes: number) {
  const task = await ensureTodayTask();
  const access = await verifyFullAccess(learnerId);
  const completion = await supabaseAdminRequest<CompletionRow[]>(`/rest/v1/daily_task_completions?user_id=eq.${encodeURIComponent(learnerId)}&daily_task_id=eq.${task.id}&select=state,xp_earned,completed_at`);
  const [profile, xp] = await Promise.all([
    supabaseAdminRequest<ProfileRow[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}&select=id,xp,current_streak,longest_streak,last_learning_at,last_learning_day`),
    verifiedXpTotal(learnerId),
  ]);
  // The XP here is the verified total, not the cached column the row carries.
  // The web daily page and both mobile payloads read this one object, and a
  // Learner seeing a different total on their phone than on the dashboard is
  // the cache being treated as the truth again.
  const row = profile[0] ?? { id: learnerId, current_streak: 0, longest_streak: 0, last_learning_at: null, last_learning_day: null };
  // Derived here, not read off the row: `current_streak` is the length of a run
  // and says nothing about whether the run is still alive (ticket 11).
  const streak = deriveStreak(row.current_streak, row.last_learning_day, new Date(), offsetMinutes);
  return { task, completion: completion[0] ?? { state: "not_started", xp_earned: 0, completed_at: null }, profile: { ...row, xp }, streak, hasPaidAccess: access.hasFullAccess, locked: Boolean(task.required_plan_code && !access.hasFullAccess) };
}

export async function completeDailyLearningTask(learnerId: string, offsetMinutes: number, input: { score: number; submittedCode?: { html?: string; css?: string; javascript?: string } }) {
  const overview = await getDailyLearningOverview(learnerId, offsetMinutes);
  if (overview.locked) throw new Error("This daily task is part of Full Access. Choose a plan to continue.");
  if (overview.completion.state === "completed") return { alreadyCompleted: true, awardedXp: 0, streak: overview.streak };
  await supabaseAdminRequest(`/rest/v1/daily_task_completions?on_conflict=user_id,daily_task_id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: learnerId, daily_task_id: overview.task.id, state: "completed", score: input.score, xp_earned: overview.task.xp_reward, completed_at: new Date().toISOString() }) });
  // XP goes through awardXp like every other unit of learning. This path used
  // to patch the total inline, which made it a second write path with the same
  // race and no record of what the number was made of (ADR 0002). The Streak
  // followed it there in ticket 11: this path no longer has one of its own,
  // because it is no longer the only path that has one.
  const awardedXp = await awardXp(learnerId, overview.task.xp_reward, { kind: "daily_task", id: overview.task.id }, offsetMinutes);
  await addActivity(learnerId, "daily_task", "Daily task completed", `Completed ${overview.task.title}.`, { daily_task_id: overview.task.id, score: input.score, submitted_code: input.submittedCode ?? {} });
  const newAwards = await reconcileVerifiedAwards(learnerId, offsetMinutes);
  // The run `awardXp` just wrote, rather than a re-read: it was extended with
  // this request's offset a moment ago, so its last day is this request's today
  // and the derived Streak is the run itself.
  const streak = awardedXp ? (await currentRun(learnerId)).run : overview.streak;
  return { alreadyCompleted: false, awardedXp, streak, newAwards: newAwards.map(award => ({ awardSlug: award.slug, name: award.name })) };
}

/** The stored run, as the two columns a Streak is derived from. */
async function currentRun(learnerId: string) {
  const profiles = await supabaseAdminRequest<Array<{ current_streak: number; last_learning_day: string | null }>>(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}&select=current_streak,last_learning_day&limit=1`);
  const profile = profiles[0] ?? { current_streak: 0, last_learning_day: null };
  return { run: profile.current_streak, lastLearningDay: profile.last_learning_day };
}

type EnrollmentRow = { id: string; track_id: string };
type ProgressRow = { id: string; lesson_id: string; state: "not_started" | "in_progress" | "completed"; xp_earned: number };
type ActivityRow = { id: string; event_type: string; title: string; detail: string | null; created_at: string };
type AwardRow = { id: string; slug: string; name: string; description: string; icon_key: string | null };
type UserAwardRow = { award_id: string };

async function addActivity(learnerId: string, eventType: string, title: string, detail: string, metadata: Record<string, unknown> = {}) {
  await supabaseAdminRequest("/rest/v1/activity_events", { method: "POST", body: JSON.stringify({ user_id: learnerId, event_type: eventType, title, detail, metadata }) });
}

/**
 * Which Completion an XP award is for.
 *
 * The kind names the unit of learning; the id is the unit the Learner
 * completed, which together with the Learner identifies their Completion of it
 * exactly. Every Completion table is unique per Learner per unit, so the pair
 * maps one-to-one onto a Completion record without a round-trip to fetch its
 * row id.
 */
type XpSource = { kind: "lesson" | "challenge" | "daily_task" | "project" | "mission"; id: string };

/**
 * The single path by which a Learner is granted XP (ADR 0002).
 *
 * An XP Entry is appended naming the Completion that caused it, and the unique
 * constraint on (user_id, source_kind, source_id) is what makes a double award
 * impossible: the database rejects the second write rather than the application
 * narrowing a read-modify-write window it cannot close. PostgREST answers an
 * ignored duplicate with no rows, which is how a replayed request is recognised.
 *
 * `profiles.xp` is a cache of this ledger and is recomputed from it below,
 * never incremented and never written from a value this process read earlier.
 *
 * Returns the XP actually granted, which is 0 for a duplicate.
 */
async function awardXp(learnerId: string, amount: number, source: XpSource, offsetMinutes: number) {
  const entries = await supabaseAdminRequest<Array<{ id: string }>>("/rest/v1/xp_entries?on_conflict=user_id,source_kind,source_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ user_id: learnerId, amount, source_kind: source.kind, source_id: source.id }) });
  if (!entries.length) return 0;
  await recomputeCachedXpTotal(learnerId);
  await extendLearningStreak(learnerId, offsetMinutes);
  return amount;
}

/**
 * Advance the Learner's run of Local Days, once per Completion.
 *
 * This sits inside `awardXp` because that is already the single path every unit
 * of learning takes (ADR 0002), so a Lesson, Challenge, Daily Task, Project and
 * Mission each reach it without five call sites having to remember to. Before
 * ticket 11 only the Daily Task path advanced a Streak, which is why a Learner
 * who spent a week on Lessons saw a Streak of 1.
 *
 * It runs only when an XP Entry was actually appended, so a replayed request
 * that awards nothing also extends nothing.
 *
 * `last_learning_at` is the real instant. It used to be stamped at noon UTC,
 * which was a fabrication that made the column useless for anything but the
 * date it carried; the Local Day now lives in `last_learning_day`, computed
 * with the completing request's offset.
 *
 * Still a read-modify-write, and still races: two Completions landing together
 * can both read the same run. The window is small and the cost is one
 * undercounted day, which is why it is left rather than serialised - and it is
 * bounded now in a way the old floor-at-1 was not.
 */
async function extendLearningStreak(learnerId: string, offsetMinutes: number) {
  const profiles = await supabaseAdminRequest<Array<{ current_streak: number; longest_streak: number; last_learning_day: string | null }>>(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}&select=current_streak,longest_streak,last_learning_day&limit=1`);
  const profile = profiles[0] ?? { current_streak: 0, longest_streak: 0, last_learning_day: null };
  const completedAt = new Date();
  const next = extendStreak({ run: profile.current_streak, lastLearningDay: profile.last_learning_day }, completedAt, offsetMinutes);
  await supabaseAdminRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ current_streak: next.run, longest_streak: Math.max(profile.longest_streak, next.run), last_learning_day: next.lastLearningDay, last_learning_at: completedAt.toISOString(), updated_at: completedAt.toISOString() }) });
  return next;
}

/**
 * Rewrite a Learner's cached total from their ledger, atomically.
 *
 * The recompute happens inside the database, in one UPDATE whose new value is a
 * subquery over the ledger. Doing it here instead - reading the sum, then
 * writing it back - would still be a read-modify-write however absolute the
 * value written: two awards landing together could both read, then both write,
 * and the later write carry the earlier sum. That is the window ticket 08 left
 * open and this closes; the application cannot close it on its own.
 */
async function recomputeCachedXpTotal(learnerId: string) {
  const total = await supabaseAdminRequest<number>("/rest/v1/rpc/recompute_learner_xp", { method: "POST", body: JSON.stringify({ learner: learnerId }) });
  return typeof total === "number" ? total : 0;
}

/**
 * A Learner's XP: the sum of their XP Entries, and the only number any award,
 * gate or display may treat as their total (ADR 0002).
 *
 * Read from a view rather than by summing rows in the application, because the
 * ledger grows without bound and PostgREST caps how many rows it returns. A sum
 * over a page of entries would go quietly wrong for exactly the Learners who
 * have earned the most.
 *
 * A Learner with no entries has no row in the view, and their total is 0. It
 * deliberately does not fall back to `profiles.xp`: that would restore the old
 * authority for precisely the Learners whose ledger cannot vouch for them.
 */
async function verifiedXpTotal(learnerId: string) {
  const totals = await supabaseAdminRequest<Array<{ xp: number }>>(`/rest/v1/learner_xp_totals?user_id=eq.${encodeURIComponent(learnerId)}&select=xp&limit=1`);
  return totals[0]?.xp ?? 0;
}

/**
 * Compare a Learner's cached total against their ledger, and correct it.
 *
 * The correction is the ledger's own sum. No adjustment is computed and no
 * number is invented: if the two disagree, the entries are right by definition
 * and the cache is simply overwritten with what they add up to.
 *
 * Divergence should not arise now that the cache is recomputed from the ledger
 * on every award, but a cache that can drift and cannot be checked is how XP
 * got into trouble in the first place. This is the check.
 *
 * Reached by an operator through `learning.adminReconcileXp`, which is admin
 * gated. It was written without a caller and stayed unreachable for two
 * tickets; the spec asks for divergence to be both detectable and correctable
 * by an operator, and a capability nothing can call does not answer that. The
 * same check exists as SQL in the ticket 09 migration's verification block for
 * whoever is holding a psql prompt instead.
 */
export async function reconcileXpTotal(learnerId: string) {
  const [profiles, ledger] = await Promise.all([
    supabaseAdminRequest<Array<{ xp: number }>>(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}&select=xp&limit=1`),
    verifiedXpTotal(learnerId),
  ]);
  const cached = profiles[0]?.xp ?? 0;
  const diverged = cached !== ledger;
  if (diverged) await recomputeCachedXpTotal(learnerId);
  return { cached, ledger, diverged };
}

async function recordEarnedAward(learnerId: string, slug: string) {
  const awards = await supabaseAdminRequest<AwardRow[]>(`/rest/v1/awards?slug=eq.${encodeURIComponent(slug)}&select=id,slug,name,description,icon_key&limit=1`);
  const award = awards[0];
  if (!award) return undefined;
  const created = await supabaseAdminRequest<UserAwardRow[]>("/rest/v1/user_awards?on_conflict=user_id,award_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ user_id: learnerId, award_id: award.id }) });
  return created.length ? award : undefined;
}

/**
 * The Missions a Learner has cleared, as the ids of the Missions themselves.
 *
 * One reader for two questions - which Missions are open to a Learner, and
 * whether they have earned Launchpad - so the two can never drift onto
 * different evidence. They were counted out of the Activity Feed before ticket
 * 05, which ADR 0003 makes presentational and prunable.
 */
async function clearedMissionIds(learnerId: string) {
  const completions = await supabaseAdminRequest<Array<{ mission_id: string }>>(`/rest/v1/mission_completions?user_id=eq.${encodeURIComponent(learnerId)}&select=mission_id`);
  // A Set rather than a count: the unique constraint on (user_id, mission_id)
  // already makes a duplicate impossible, so this is a second lock on the same
  // door rather than the only one.
  return new Set(completions.map(item => item.mission_id));
}

async function getAwardSnapshot(learnerId: string, offsetMinutes: number): Promise<AwardMetricSnapshot> {
  const { lessons } = await ensureSupabaseCurriculum();
  const [profiles, progress, passedChallenges, dailyCompletions, projectCompletions, clearedMissions, xp] = await Promise.all([
    supabaseAdminRequest<ProfileRow[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}&select=id,current_streak,longest_streak,last_learning_at,last_learning_day&limit=1`),
    supabaseAdminRequest<Array<{ lesson_id: string }>>(`/rest/v1/lesson_progress?user_id=eq.${encodeURIComponent(learnerId)}&state=eq.completed&select=lesson_id`),
    supabaseAdminRequest<Array<{ id: string }>>(`/rest/v1/challenge_attempts?user_id=eq.${encodeURIComponent(learnerId)}&passed=eq.true&select=id`),
    supabaseAdminRequest<Array<{ id: string }>>(`/rest/v1/daily_task_completions?user_id=eq.${encodeURIComponent(learnerId)}&state=eq.completed&select=id`),
    supabaseAdminRequest<Array<{ project_id: string }>>(`/rest/v1/project_progress?user_id=eq.${encodeURIComponent(learnerId)}&completed_at=not.is.null&select=project_id`),
    clearedMissionIds(learnerId),
    verifiedXpTotal(learnerId),
  ]);
  const lessonById = new Map(lessons.map(lesson => [lesson.id, lesson.slug]));
  const profile = profiles[0] ?? { xp: 0, current_streak: 0, last_learning_day: null };
  // XP comes from the ledger, not from `profile`. Steady Hand ("Earn 200 XP")
  // was the one award granted from a number no record could defend; it is now
  // verified from the same kind of evidence as every other award.
  //
  // The Streak is derived for the same reason: a Streak award must be measured
  // against the Streak the Learner actually holds, not a run that lapsed.
  return { xp, currentStreak: deriveStreak(profile.current_streak, profile.last_learning_day, new Date(), offsetMinutes), completedLessonSlugs: progress.map(item => lessonById.get(item.lesson_id)).filter((slug): slug is string => Boolean(slug)), passedChallengeCount: passedChallenges.length, completedDailyCount: dailyCompletions.length, completedProjectCount: projectCompletions.length, completedBeginnerBuildMissionCount: clearedMissions.size };
}

async function reconcileVerifiedAwards(learnerId: string, offsetMinutes: number, providedSnapshot?: AwardMetricSnapshot) {
  const snapshot = providedSnapshot ?? await getAwardSnapshot(learnerId, offsetMinutes);
  const unlocked = [] as AwardRow[];
  for (const award of verifiedAwards(snapshot).filter(award => award.earned)) {
    const added = await recordEarnedAward(learnerId, award.slug);
    if (added) {
      unlocked.push(added);
      await addActivity(learnerId, "award", "Award unlocked", `Earned the ${added.name} award.`, { award_slug: added.slug });
    }
  }
  return unlocked;
}

export async function getSupabaseLearnerDashboard(learnerId: string, offsetMinutes: number) {
  const { tracks, lessons } = await ensureSupabaseCurriculum();
  const awardSnapshot = await getAwardSnapshot(learnerId, offsetMinutes);
  await reconcileVerifiedAwards(learnerId, offsetMinutes, awardSnapshot);
  const [profiles, enrollments, progress, activity, userAwards] = await Promise.all([
    supabaseAdminRequest<ProfileRow[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(learnerId)}&select=id,current_streak,longest_streak,last_learning_at,last_learning_day&limit=1`),
    supabaseAdminRequest<EnrollmentRow[]>(`/rest/v1/enrollments?user_id=eq.${encodeURIComponent(learnerId)}&select=id,track_id`),
    supabaseAdminRequest<ProgressRow[]>(`/rest/v1/lesson_progress?user_id=eq.${encodeURIComponent(learnerId)}&select=id,lesson_id,state,xp_earned`),
    supabaseAdminRequest<ActivityRow[]>(`/rest/v1/activity_events?user_id=eq.${encodeURIComponent(learnerId)}&select=id,event_type,title,detail,created_at&order=created_at.desc&limit=6`),
    supabaseAdminRequest<UserAwardRow[]>(`/rest/v1/user_awards?user_id=eq.${encodeURIComponent(learnerId)}&select=award_id`),
  ]);
  const profile = profiles[0] ?? { id: learnerId, xp: 0, current_streak: 0, longest_streak: 0, last_learning_at: null, last_learning_day: null };
  const lessonById = new Map(lessons.map(lesson => [lesson.id, lesson]));
  const trackById = new Map(Array.from(tracks.values()).map(track => [track.id, track]));
  const completedLessons = progress.filter(item => item.state === "completed").length;
  const earnedAwardIds = new Set(userAwards.map(item => item.award_id));
  const allAwards = await supabaseAdminRequest<AwardRow[]>("/rest/v1/awards?select=id,slug,name,description,icon_key");
  const awardedSlugs = new Set(allAwards.filter(item => earnedAwardIds.has(item.id)).map(item => item.slug));
  const verifiedAwardCatalog = verifiedAwards(awardSnapshot);
  return {
    // The verified total, the same number Steady Hand is granted from. Showing
    // the cached column here would let a Learner see a total their ledger does
    // not support.
    stats: { xp: awardSnapshot.xp, streak: awardSnapshot.currentStreak, completedLessons },
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

export async function completeSupabaseLesson(learnerId: string, offsetMinutes: number, input: { lessonId: string; track: "HTML" | "CSS" | "JavaScript"; difficulty: "Beginner" | "Intermediate" | "Advanced"; xp: number }) {
  const { lessons } = await ensureSupabaseCurriculum();
  const lesson = lessons.find(item => item.slug === input.lessonId);
  if (!lesson) throw new Error("Lesson is not available yet");
  const existing = await supabaseAdminRequest<Array<{ state: string }>>(`/rest/v1/lesson_progress?user_id=eq.${encodeURIComponent(learnerId)}&lesson_id=eq.${lesson.id}&select=state&limit=1`);
  const isNewCompletion = existing[0]?.state !== "completed";
  await supabaseAdminRequest("/rest/v1/lesson_progress?on_conflict=user_id,lesson_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: learnerId, lesson_id: lesson.id, state: "completed", score: 100, xp_earned: input.xp, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
  if (isNewCompletion) {
    const awardedXp = await awardXp(learnerId, input.xp, { kind: "lesson", id: lesson.id }, offsetMinutes);
    await addActivity(learnerId, "lesson", "Lesson completed", `Completed ${input.lessonId.replace(/-/g, " ")}.`, { lesson_slug: input.lessonId });
    const newAwards = await reconcileVerifiedAwards(learnerId, offsetMinutes);
    return { completed: true, isNewCompletion, awardedXp, newAwards: newAwards.map(award => ({ awardSlug: award.slug, name: award.name })) };
  }
  return { completed: true, isNewCompletion, awardedXp: 0, newAwards: [] as Array<{ awardSlug: string; name: string }> };
}

export async function recordSupabaseChallengeAttempt(learnerId: string, offsetMinutes: number, input: { challengeId: string; score: number; passed: boolean; summary: string }) {
  const { lessons } = await ensureSupabaseCurriculum();
  const lesson = lessons.find(item => item.slug === input.challengeId);
  if (!lesson) throw new Error("Challenge is not available yet");
  const challenges = await supabaseAdminRequest<Array<{ id: string }>>(`/rest/v1/challenges?lesson_id=eq.${lesson.id}&select=id&limit=1`);
  const challenge = challenges[0];
  if (!challenge) throw new Error("Challenge is not available yet");
  await supabaseAdminRequest("/rest/v1/challenge_attempts", { method: "POST", body: JSON.stringify({ user_id: learnerId, challenge_id: challenge.id, score: input.score, passed: input.passed, feedback: { summary: input.summary } }) });
  await addActivity(learnerId, "challenge", input.passed ? "Challenge passed" : "Challenge attempted", input.summary, { lesson_slug: input.challengeId, score: input.score });
  // The entry names the Challenge, not the attempt. An attempt is a new row
  // every submission, so keying on it would pay a Learner again for
  // resubmitting work they had already passed - and Steady Hand ("Earn 200 XP")
  // rests on this total. Passing a Challenge is paid once.
  const awardedXp = input.passed ? await awardXp(learnerId, 20, { kind: "challenge", id: challenge.id }, offsetMinutes) : 0;
  const newAwards = input.passed ? await reconcileVerifiedAwards(learnerId, offsetMinutes) : [];
  return { saved: true, awardedXp, newAwards: newAwards.map(award => ({ awardSlug: award.slug, name: award.name })) };
}

export async function recordSupabaseProjectCompletion(learnerId: string, offsetMinutes: number, input: { projectId: string; title: string }) {
  const { projects } = await ensureSupabaseCurriculum();
  const project = projects.find(row => row.slug === input.projectId);
  if (!project) throw new Error("This project is not available.");
  // The Completion record, unique per Learner per Project, is the evidence the
  // Builder award reads. The Activity Feed entry below is presentational only
  // (ADR 0003) and nothing is ever counted from it.
  // Ignore rather than merge: a second completion must not overwrite the date
  // the Learner first finished this Project. That date is the Completion.
  await supabaseAdminRequest("/rest/v1/project_progress?on_conflict=user_id,project_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ user_id: learnerId, project_id: project.id, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
  const awardedXp = await awardXp(learnerId, 100, { kind: "project", id: project.id }, offsetMinutes);
  await addActivity(learnerId, "project", "Project completed", `Completed the ${input.title} project.`, { project_slug: input.projectId });
  const newAwards = await reconcileVerifiedAwards(learnerId, offsetMinutes);
  return { saved: true, projectId: input.projectId, awardedXp, newAwards: newAwards.map(award => ({ awardSlug: award.slug, name: award.name })) };
}

export async function completeBeginnerBuildMission(learnerId: string, offsetMinutes: number, input: { missionId: string; code: string }) {
  const missionIndex = BEGINNER_BUILD_MISSIONS.findIndex(mission => mission.id === input.missionId);
  const mission = BEGINNER_BUILD_MISSIONS[missionIndex];
  if (!mission) throw new Error("This beginner build mission is not available.");
  const check = checkBeginnerBuildMission(mission, input.code);
  if (!check.passed) return { completed: false, score: check.score, missing: check.missing, awardedXp: 0, newAwards: [] as Array<{ awardSlug: string; name: string }> };
  const { missions } = await ensureSupabaseCurriculum();
  const missionRow = missions.find(row => row.slug === mission.id);
  if (!missionRow) throw new Error("This beginner build mission is not available.");
  const cleared = await clearedMissionIds(learnerId);
  const missionIdBySlug = new Map(missions.map(row => [row.slug, row.id]));
  const requiredPrevious = BEGINNER_BUILD_MISSIONS.slice(0, missionIndex).map(item => missionIdBySlug.get(item.id));
  if (requiredPrevious.some(id => !id || !cleared.has(id))) throw new Error("Clear the earlier Beginner Build Lab mission before opening this one.");
  if (cleared.has(missionRow.id)) return { completed: true, alreadyCompleted: true, score: 100, missing: [] as string[], awardedXp: 0, newAwards: [] as Array<{ awardSlug: string; name: string }> };
  // The Completion record, unique per Learner per Mission, is the evidence the
  // Launchpad award reads. The Activity Feed entry below is presentational only
  // (ADR 0003) and nothing is ever counted from it.
  // Ignore rather than merge: a second clearing must not overwrite the date the
  // Learner first cleared this Mission. That date is the Completion.
  await supabaseAdminRequest("/rest/v1/mission_completions?on_conflict=user_id,mission_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ user_id: learnerId, mission_id: missionRow.id, completed_at: new Date().toISOString() }) });
  const awardedXp = await awardXp(learnerId, mission.rewardXp, { kind: "mission", id: missionRow.id }, offsetMinutes);
  await addActivity(learnerId, "beginner_module", "Beginner Build Lab mission cleared", `Completed ${mission.title}.`, { module: "beginner-build", mission_id: mission.id, score: check.score });
  const newAwards = await reconcileVerifiedAwards(learnerId, offsetMinutes);
  return { completed: true, alreadyCompleted: false, score: check.score, missing: [] as string[], awardedXp, newAwards: newAwards.map(award => ({ awardSlug: award.slug, name: award.name })) };
}
