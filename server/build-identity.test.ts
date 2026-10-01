import express from "express";
import { beforeEach, describe, expect, it } from "vitest";

import { buildIdentity, registerBuildIdentity } from "./buildIdentity";

/**
 * The four variables Render sets automatically, spelled as Render's own documentation
 * spells them. A typo here is not a failing test, it is a route that answers `null`
 * forever in production while every test passes, so the names are the subject of the
 * first test rather than a detail of its setup.
 */
const ON_RENDER = {
  RENDER_GIT_COMMIT: "78e321f0000000000000000000000000000000ab",
  RENDER_GIT_BRANCH: "main",
  RENDER_GIT_REPO_SLUG: "Collinzo2022/spellcode-by-aceify",
  RENDER_SERVICE_NAME: "spellcode-backend",
};

describe("the build a process is running", () => {
  it("reads the commit, branch, repository and service Render sets", () => {
    expect(buildIdentity(ON_RENDER)).toMatchObject({
      commit: "78e321f0000000000000000000000000000000ab",
      branch: "main",
      repo: "Collinzo2022/spellcode-by-aceify",
      service: "spellcode-backend",
    });
  });

  // The question this route exists to answer is "is production running my commit?", and
  // the answer "I cannot tell you" has to be distinguishable from an answer. A placeholder
  // string would read as a value; `null` cannot be mistaken for one.
  it("answers null rather than inventing a value when nothing set them", () => {
    expect(buildIdentity({})).toMatchObject({ commit: null, branch: null, repo: null, service: null });
  });

  // Render leaves a variable it has no value for as the empty string rather than unsetting
  // it, and `""` is not a commit.
  it("treats an empty variable as absent", () => {
    expect(buildIdentity({ ...ON_RENDER, RENDER_GIT_COMMIT: "" })).toMatchObject({ commit: null });
  });

  // A deploy and a cold start look identical in the commit alone: a free instance that slept
  // and woke is running the same code it was. The start time tells them apart, which matters
  // because this host sleeps when idle - see docs/production_architecture.md.
  it("says when the process started", () => {
    expect(Date.parse(buildIdentity(ON_RENDER).startedAt)).not.toBeNaN();
  });
});

describe("GET /api/version", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    registerBuildIdentity(app);
  });

  async function callEndpoint() {
    const server = await new Promise<ReturnType<express.Express["listen"]>>(resolve => { const instance = app.listen(0, () => resolve(instance)); });
    const address = server.address(); const port = typeof address === "object" && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/api/version`);
    const payload = await response.json().catch(() => null);
    await new Promise<void>(resolve => server.close(() => resolve()));
    return { status: response.status, contentType: response.headers.get("content-type") ?? "", payload };
  }

  // Unauthenticated on purpose: the whole value of this route is that one curl answers
  // "did my push reach production?", and a route needing a secret would be one more thing
  // to have configured correctly before it could tell you anything.
  it("answers any caller with the running build, as JSON", async () => {
    const { status, contentType, payload } = await callEndpoint();

    expect(status).toBe(200);
    // The content type is the same tell docs/production_architecture.md already uses to
    // distinguish the backend from the SPA shell Vercel serves for an unmatched route.
    expect(contentType).toContain("application/json");
    expect(payload).toHaveProperty("commit");
    expect(payload).toHaveProperty("startedAt");
  });

  // This route is public, so what it must never carry is anything the rest of the
  // environment holds: the service-role key, the Paystack secret, the scheduled-task secret.
  it("carries nothing but the build's identity", async () => {
    const { payload } = await callEndpoint();

    expect(Object.keys(payload as object).sort()).toEqual(["branch", "commit", "repo", "service", "startedAt"]);
  });
});
