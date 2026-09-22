/**
 * Skip the calling test unless every named environment variable is set and
 * not empty.
 *
 * For tests that assert against a real service (a Supabase project, a Paystack
 * key) and so cannot pass anywhere those credentials are absent. Call it first
 * in the test body, passing the test's context. Vitest 2's skip takes no
 * reason and its default reporter counts skipped tests without naming them, so
 * the warning, printed under the test's name, is where the reason appears.
 *
 * A value of only whitespace counts as set, unlike Forge's rule in
 * server/availability.ts: the test then runs and fails on the bad value, where
 * treating it as missing would turn a broken secret into a quiet skip.
 *
 * Vitest does not load .env, so a run meant to use real keys can lack them
 * without anyone noticing. A run that must reach the real services sets
 * REQUIRE_CREDENTIALS, and a missing credential then fails the test instead.
 */
export function skipWithoutCredentials(context: { skip: () => void }, names: readonly string[]): void {
  const missing = names.filter(name => !process.env[name]);
  if (missing.length === 0) return;
  if (process.env.REQUIRE_CREDENTIALS) throw new Error(`${missing.join(", ")} not set, and REQUIRE_CREDENTIALS is on.`);
  console.warn(`Skipped: ${missing.join(", ")} not set.`);
  context.skip();
}
