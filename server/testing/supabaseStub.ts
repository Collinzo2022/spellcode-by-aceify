import { vi } from "vitest";
import { CURRICULUM } from "../../shared/curriculum";

/**
 * Test double for the single Supabase REST choke point.
 *
 * Every Supabase read and write in the application passes through
 * `supabaseAdminRequest`, so stubbing that one function is enough to exercise the
 * real routers, the real learning service and the real shared logic against
 * staged rows. Tests stage rows by path and assert on what a learner observes.
 */

export type RecordedWrite = { path: string; method: string; body: unknown };

type StagedRead = { match: RegExp; rows: unknown };

/**
 * Track and lesson rows derived from the real curriculum.
 *
 * The learning service resolves curriculum rows with non-null assertions, so a
 * stub that returned an empty table would throw rather than fail an assertion.
 * Deriving the rows from `CURRICULUM` keeps them in step with the source of
 * truth automatically.
 */
function curriculumRows() {
  const tracks = CURRICULUM.map((track, index) => ({
    id: `track-${index + 1}`,
    slug: track.id,
    name: track.name,
    color_hex: track.color,
  }));
  const trackIdBySlug = new Map(tracks.map(track => [track.slug, track.id]));
  const lessons = CURRICULUM.flatMap(track =>
    track.lessons.map(lesson => ({
      id: `lesson-${track.id}-${lesson.id}`,
      slug: lesson.id,
      track_id: trackIdBySlug.get(track.id)!,
      title: lesson.title,
      difficulty: lesson.difficulty,
      duration_minutes: 12,
      xp_reward: lesson.xp,
      description: lesson.description,
      theory_markdown: lesson.theory,
      example_code: { code: lesson.example },
    })),
  );
  return { tracks, lessons };
}

function prefersRepresentation(init: RequestInit) {
  const prefer = new Headers(init.headers).get("Prefer") ?? "";
  return prefer.includes("return=representation");
}

export function createSupabaseStub(learnerId: string) {
  const { tracks, lessons } = curriculumRows();
  const staged: StagedRead[] = [];
  const writes: RecordedWrite[] = [];

  const request = vi.fn(async (path: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();

    if (method !== "GET") {
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      writes.push({ path, method, body });
      // PostgREST echoes the written rows back only when asked to. Production
      // code branches on that response, so the stub must honour it.
      if (!prefersRepresentation(init)) return [];
      return Array.isArray(body) ? body : [body];
    }

    const match = staged.find(entry => entry.match.test(path));
    if (match) return match.rows;

    // Curriculum is seeded on demand by the service and must resolve.
    if (path.startsWith("/rest/v1/tracks")) return tracks;
    if (path.startsWith("/rest/v1/lessons")) return lessons;

    // Every other table is empty unless a test stages it.
    return [];
  });

  return {
    request,
    lessons,

    /** Stage rows to be returned by reads whose path matches. Latest wins. */
    stageRows(match: RegExp, rows: unknown) {
      staged.unshift({ match, rows });
    },

    /**
     * Grant Full Access by staging an active subscription and its plan.
     *
     * The staged paths deliberately include the learner and the active-status
     * filter, so a query that dropped either would miss this stub and correctly
     * fail to find an entitlement.
     */
    grantFullAccess() {
      staged.unshift({
        match: new RegExp(`^/rest/v1/subscriptions\\?user_id=eq\\.${learnerId}&status=eq\\.active`),
        rows: [{ plan_id: "plan-1", status: "active", current_period_end: null }],
      });
      // Full Access is a single gate (ADR 0001); plan features carry no meaning.
      staged.unshift({ match: /^\/rest\/v1\/plans\?id=in\.\(plan-1\)/, rows: [{ id: "plan-1", paid_features: [] }] });
    },

    /** Writes recorded against a table, in the order they were issued. */
    writesTo(table: string) {
      return writes.filter(write => write.path.startsWith(`/rest/v1/${table}`));
    },
  };
}
