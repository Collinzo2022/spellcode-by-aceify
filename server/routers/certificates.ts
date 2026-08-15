import { protectedProcedure, router } from "../_core/trpc";
import { supabaseAdminRequest } from "../supabase";
import { getVerifiedEntitlements } from "../supabaseLearning";
import { storagePut } from "../storage";
import { canIssueCertificate } from "../../shared/entitlements";

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character); }

async function certificateProgress(userId: string) {
  const [completed, lessons] = await Promise.all([
    supabaseAdminRequest<Array<{ lesson_id: string }>>(`/rest/v1/lesson_progress?user_id=eq.${encodeURIComponent(userId)}&state=eq.completed&select=lesson_id`),
    supabaseAdminRequest<Array<{ id: string }>>("/rest/v1/lessons?select=id"),
  ]);
  return { completedLessons: completed.length, totalLessons: lessons.length, eligible: canIssueCertificate(true, completed.length, lessons.length) };
}

export const certificatesRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const access = await getVerifiedEntitlements(ctx.user.openId);
    if (!access.hasFullAccess) return { hasFullAccess: false, eligible: false, completedLessons: 0, totalLessons: 0, certificate: null };
    const progress = await certificateProgress(ctx.user.openId);
    const records = await supabaseAdminRequest<Array<{ download_url: string; issued_at: string }>>(`/rest/v1/certificates?user_id=eq.${encodeURIComponent(ctx.user.openId)}&select=download_url,issued_at&limit=1`);
    return { hasFullAccess: true, ...progress, certificate: records[0] ?? null };
  }),
  issue: protectedProcedure.mutation(async ({ ctx }) => {
    const access = await getVerifiedEntitlements(ctx.user.openId);
    if (!access.hasFullAccess) throw new Error("Certificates are available with Full Access.");
    const progress = await certificateProgress(ctx.user.openId);
    if (!canIssueCertificate(access.hasFullAccess, progress.completedLessons, progress.totalLessons)) throw new Error(`Complete all ${progress.totalLessons} lessons before issuing your certificate.`);
    const existing = await supabaseAdminRequest<Array<{ download_url: string }>>(`/rest/v1/certificates?user_id=eq.${encodeURIComponent(ctx.user.openId)}&select=download_url&limit=1`);
    if (existing[0]) return { url: existing[0].download_url, alreadyIssued: true };
    const number = `SC-${new Date().getUTCFullYear()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const name = escapeHtml(ctx.user.name ?? "SpellCode learner");
    const artifact = await storagePut(`certificates/${ctx.user.openId}/${number}.html`, `<!doctype html><html><head><meta charset="utf-8"/><title>SpellCode by Aceify certificate</title><style>body{margin:0;background:#111116;color:#f8f5ef;font-family:Georgia,serif}.certificate{box-sizing:border-box;min-height:100vh;padding:12vw;text-align:center;background:radial-gradient(circle at 50% 10%,#4d3f73,transparent 34%),#111116}.mark{color:#c8a46e;letter-spacing:.24em;font:700 11px system-ui}.name{font-size:56px;margin:44px 0 12px}.body{max-width:680px;margin:auto;color:#d6d0dc;font:18px/1.65 system-ui}.number{margin-top:58px;color:#c8a46e;font:12px system-ui;letter-spacing:.12em}</style></head><body><main class="certificate"><p class="mark">SPELLCODE BY ACEIFY</p><h1>Certificate of completion</h1><p class="body">This certifies that</p><h2 class="name">${name}</h2><p class="body">has completed the verified SpellCode by Aceify web development learning path.</p><p class="number">${number}</p></main></body></html>`, "text/html; charset=utf-8");
    await supabaseAdminRequest("/rest/v1/certificates", { method: "POST", body: JSON.stringify({ user_id: ctx.user.openId, certificate_number: number, storage_key: artifact.key, download_url: artifact.url }) });
    return { url: artifact.url, alreadyIssued: false };
  }),
});
