import type { Express, Request, Response } from "express";

/**
 * When this process started, read once because it is a fact about the process and not
 * about the request. A free Render instance sleeps when idle, so a restart is ordinary
 * here and is not the same event as a deploy - see `docs/production_architecture.md`.
 */
const STARTED_AT = new Date().toISOString();

/**
 * What a running process can say about which code it is.
 *
 * Every field is `null` when nothing set it, which is the answer a local `pnpm dev` gives.
 * A placeholder like "unknown" would read as a value to anything comparing against a
 * commit; `null` cannot.
 */
type BuildIdentity = { commit: string | null; branch: string | null; repo: string | null; service: string | null; startedAt: string };

/** An environment variable's value, or `null` for one that is unset or empty. */
const present = (value: string | undefined) => (value ? value : null);

/**
 * Which commit this process is running, from the variables the host sets.
 *
 * Read from `process.env` rather than injected at build time so that nothing has to
 * happen in the build for this to be true: `esbuild` bundles `server/_core/index.ts`
 * with no git available, and a SHA baked in by a build step is a SHA that can be baked
 * in wrongly. These four names are Render's own, quoted from its documented list of
 * automatic variables: `RENDER_GIT_COMMIT` ("The commit SHA for a service or deploy"),
 * `RENDER_GIT_BRANCH`, `RENDER_GIT_REPO_SLUG` ("Has the format $username/$reponame")
 * and `RENDER_SERVICE_NAME`.
 *
 * The repository slug earns its place beside the commit. `docs/production_architecture.md`
 * records that a platform connected to an earlier home of this code "will sit at whatever
 * commit it last saw while pushes appear to succeed" - a failure the commit alone cannot
 * show, because that stale commit is a real one. The slug says which repository the
 * answer is about.
 *
 * Takes the environment as an argument so a test can state one. `process.env` is not
 * reached through `server/_core/env.ts`: that file is vendored scaffold a regeneration
 * clobbers, and these variables are the host's rather than the application's.
 */
export function buildIdentity(env: Record<string, string | undefined> = process.env): BuildIdentity {
  return {
    commit: present(env.RENDER_GIT_COMMIT),
    branch: present(env.RENDER_GIT_BRANCH),
    repo: present(env.RENDER_GIT_REPO_SLUG),
    service: present(env.RENDER_SERVICE_NAME),
    startedAt: STARTED_AT,
  };
}

/**
 * Serve the running build's identity, unauthenticated.
 *
 * The question it answers - did the push I just made reach production? - was answerable
 * only from a provider dashboard until now, and twice in this project's history production
 * has turned out to be serving something other than the commit that was pushed. A route
 * needing a secret would be one more thing to have configured right before it could tell
 * anyone anything, so this one takes none and carries nothing that is not already public:
 * no environment values, no secrets, and nothing about the caller.
 */
export function registerBuildIdentity(app: Express) {
  app.get("/api/version", (_req: Request, res: Response) => res.json(buildIdentity()));
}
