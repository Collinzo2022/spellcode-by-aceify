import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canIssueCertificate,
  lessonRequiresFullAccess,
} from "../shared/fullAccess";

describe("Full Access policy", () => {
  it("keeps Level 1 available while requiring Full Access after it", () => {
    expect(lessonRequiresFullAccess(1)).toBe(false);
    expect(lessonRequiresFullAccess(2)).toBe(true);
  });

  it("issues certificates only after Full Access and all required lessons", () => {
    expect(canIssueCertificate(false, 12, 12)).toBe(false);
    expect(canIssueCertificate(true, 11, 12)).toBe(false);
    expect(canIssueCertificate(true, 12, 12)).toBe(true);
  });
});

/**
 * ADR 0001 abolished the concept, not only the array: an "entitlement" is a
 * per-feature permission, and there is no such thing here. Ticket 12 renamed
 * the code that computed one, but `subscriptions.entitlement_snapshot` outlived
 * it - a column the word survived in because nothing looked past the functions.
 *
 * Checked against the source rather than through behaviour, because the name is
 * only ever a string in a request body: no assertion on a response can see it,
 * and the write it appears in is the one a test would have to stage to reach.
 */
describe("the codebase", () => {
  function productionSources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name);
      // _core is vendored scaffold and is regenerated, not written here.
      // `testing/` is test infrastructure: `assertions.ts` holds the assertion
      // that no payload carries an `entitlements` array, and it has to be free
      // to name the thing it forbids.
      if (entry.isDirectory()) return ["_core", "node_modules", "testing"].includes(entry.name) ? [] : productionSources(path);
      const isTest = entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts");
      return entry.isFile() && entry.name.endsWith(".ts") && !isTest ? [path] : [];
    });
  }

  /**
   * Source with its comments removed.
   *
   * The ADRs and the migration headers must stay free to name the concept they
   * abolished, and so must a comment explaining why a gate is what it is.
   * Scanning comments would make documenting the decision trip the test that
   * enforces it.
   */
  function codeOf(path: string) {
    return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  it("names no entitlement in production code, in any layer", () => {
    const offenders = [join(import.meta.dirname), join(import.meta.dirname, "..", "shared")]
      .flatMap(productionSources)
      .filter(path => /entitlement/i.test(codeOf(path)));

    expect(offenders).toEqual([]);
  });
});
