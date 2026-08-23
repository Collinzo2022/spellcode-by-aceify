import { learnerIdOf } from "../learner";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { supabaseAdminRequest } from "../supabase";
import { getVerifiedEntitlements } from "../supabaseLearning";

function documentSource(input: { html: string; css: string; javascript: string }) {
  const safeScript = input.javascript.split("</script>").join("<\\/script>");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><style>html,body{min-height:100%;margin:0}*{box-sizing:border-box}${input.css}</style></head><body>${input.html}<script>${safeScript}</script></body></html>`;
}

export const projectsRouter = router({
  publish: protectedProcedure.input(z.object({ projectSlug: z.string().min(1).max(80), title: z.string().min(1).max(120), html: z.string().min(1).max(80_000), css: z.string().max(80_000), javascript: z.string().max(80_000) })).mutation(async ({ ctx, input }) => {
    const learnerId = learnerIdOf(ctx.user);
    const access = await getVerifiedEntitlements(learnerId);
    if (!access.hasFullAccess) throw new Error("Project publishing is available with Full Access.");
    const artifact = await storagePut(`published-projects/${learnerId}/${input.projectSlug}/index.html`, documentSource(input), "text/html; charset=utf-8");
    await supabaseAdminRequest("/rest/v1/published_projects?on_conflict=user_id,project_slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: learnerId, project_slug: input.projectSlug, title: input.title, storage_key: artifact.key, public_url: artifact.url, updated_at: new Date().toISOString() }) });
    return { url: artifact.url };
  }),
  mine: protectedProcedure.query(async ({ ctx }) => supabaseAdminRequest<Array<{ project_slug: string; title: string; public_url: string; updated_at: string }>>(`/rest/v1/published_projects?user_id=eq.${encodeURIComponent(learnerIdOf(ctx.user))}&select=project_slug,title,public_url,updated_at&order=updated_at.desc`)),
});
