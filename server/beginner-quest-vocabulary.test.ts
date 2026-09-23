import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ticket 13: the Beginner Quest presents Lessons, so its components must call
 * them Lessons.
 *
 * `CONTEXT.md` reserves Mission for the three Beginner Build Lab steps: "a
 * Mission is never a Lesson, Challenge, Daily Task, or Project." Ticket 03
 * corrected the award catalog and the Dashboard, Daily and Profile pages, but
 * the Beginner Quest was *built* on the wrong word - `allMissions` held
 * Lessons, `beginnerMissionIds` held Lesson slugs - so the violation was
 * structural and was left to this ticket.
 *
 * Guarded against the source rather than through behaviour, for the same
 * reason the award catalog is: a component's local variable name and a label
 * in its markup are invisible to any assertion on rendered output or on a
 * response.
 *
 * Two-sided on purpose. Banning the word everywhere would be the opposite
 * error: the Beginner Build Lab presents real Missions and must keep saying so,
 * so this also fails if an over-eager rename strips the word from the one place
 * it belongs.
 */
describe("the Beginner Quest vocabulary", () => {
  const clientRoot = join(import.meta.dirname, "..", "client", "src");

  /** The only client file that presents real Missions, so the only one that may say so. */
  const BUILD_LAB = join("pages", "BeginnerLab.tsx");

  /**
   * Copy elsewhere that names a real Mission, and so is correct.
   *
   * Listed phrase by phrase rather than by exempting the whole file, which
   * would stop guarding everything else in it. Home's hero has both: this call
   * to action links to `/beginner-lab`, where a Learner's first act really is a
   * Mission, while the mock workspace beside it depicts a Lesson and was
   * renamed.
   *
   * Keyed by file, so the exemption cannot travel: another component reusing
   * this wording for a Lesson still fails.
   */
  const REAL_MISSION_COPY: Record<string, string[]> = {
    [join("pages", "Home.tsx")]: ["Start your first mission"],
  };

  /**
   * "mission" as this project's domain word, never as a fragment of another.
   *
   * `permission` and `submission` contain the letters and mean nothing of the
   * kind - `shared/const.ts` carries a permission error message. A plain \b
   * would exclude those but would also miss `beginnerMissionIds`, because a
   * camelCase hump is not a word boundary. So: the word at a non-letter
   * boundary, in either case or in SCREAMING_SNAKE, or a capital M opening a
   * hump. The all-caps arm is not decorative - `shared/beginnerModule.ts`
   * exports `BEGINNER_BUILD_MISSIONS`, so a client `QUEST_MISSION_IDS` is the
   * shape a reintroduction would most plausibly take.
   */
  const SAYS_MISSION = /(?<![A-Za-z])(?:[Mm]ission|MISSION)|(?<=[a-z0-9])Mission/;

  function clientSources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : clientSources(path);
      return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
    });
  }

  /**
   * Source with its comments removed, as `fullAccess.test.ts` does.
   *
   * A comment recording that something used to be called a Mission has to stay
   * free to say so, or documenting the rename would trip the test enforcing it.
   */
  function codeOf(path: string) {
    return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  /** Code with that file's own allowed real-Mission phrases taken out. */
  function codeSansRealMissions(relative: string, path: string) {
    return (REAL_MISSION_COPY[relative] ?? []).reduce((source, phrase) => source.split(phrase).join(""), codeOf(path));
  }

  it("calls a Lesson a Lesson everywhere outside the Beginner Build Lab", () => {
    const offenders = clientSources(clientRoot)
      .map(path => ({ relative: path.slice(clientRoot.length + 1), path }))
      .filter(({ relative }) => relative !== BUILD_LAB)
      .filter(({ relative, path }) => SAYS_MISSION.test(codeSansRealMissions(relative, path)))
      .map(({ relative }) => relative);

    expect(offenders).toEqual([]);
  });

  it("keeps every allowed exception real, so the list cannot quietly rot", () => {
    // An exception that no longer appears is one someone deleted or reworded,
    // and a stale entry would silently excuse a future misuse of the phrase.
    // Checked against code rather than raw text, so a phrase surviving only in
    // a comment does not keep its own exemption alive.
    const stale = Object.entries(REAL_MISSION_COPY).flatMap(([relative, phrases]) => {
      const code = codeOf(join(clientRoot, relative));
      return phrases.filter(phrase => !code.includes(phrase)).map(phrase => `${relative}: ${phrase}`);
    });

    expect(stale).toEqual([]);
  });

  it("leaves the Beginner Build Lab, which presents real Missions, saying Mission", () => {
    expect(SAYS_MISSION.test(codeOf(join(clientRoot, BUILD_LAB)))).toBe(true);
  });
});
