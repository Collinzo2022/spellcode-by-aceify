import { useAuth } from "@/_core/hooks/useAuth";
import { AppFooter } from "@/components/spellcode/AppFooter";
import { AppHeader } from "@/components/spellcode/AppHeader";
import { BeginnerQuest } from "@/components/spellcode/BeginnerQuest";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Check, CheckCircle2, Clock3, Flame, LockKeyhole, Play, Sparkles, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function Daily() {
  const { isAuthenticated, user } = useAuth();
  const isSupabaseLearner = isAuthenticated && user?.loginMethod === "supabase";
  const utils = trpc.useUtils();
  const overview = trpc.learning.dailyOverview.useQuery(undefined, { enabled: isSupabaseLearner });
  const quest = trpc.learning.dashboard.useQuery(undefined, { enabled: isSupabaseLearner });
  const [code, setCode] = useState("// Write your focused practice here\n");
  const complete = trpc.learning.completeDailyTask.useMutation({
    onSuccess: (result) => {
      const awards = result.newAwards?.length ? ` Award unlocked: ${result.newAwards.map(award => award.name).join(", ")}.` : "";
      toast.success(result.alreadyCompleted ? "Today’s quest is already cleared." : `Daily quest cleared — ${result.awardedXp} XP earned.${awards}`);
      utils.learning.dailyOverview.invalidate();
      utils.learning.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!isSupabaseLearner) {
    return <div className="min-h-screen bg-[#111116] text-[#f8f5ef]"><AppHeader /><main className="grid min-h-[70vh] place-items-center px-5"><div className="max-w-md text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#7e67d8]/15 text-[#c8b8f0]"><Sparkles className="size-5" /></span><p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">Daily coding quest</p><h1 className="mt-3 font-display text-4xl tracking-[-0.05em]">One focused task a day.</h1><p className="mt-4 text-[15px] leading-7 text-[#aaa5af]">Build momentum with a short practical challenge, a real XP reward, and a streak that reflects your work.</p><button onClick={startLogin} className="mt-7 rounded-full bg-[#eee8df] px-5 py-3 text-sm font-semibold text-[#19171b]">Log in to open today’s quest</button></div></main><AppFooter /></div>;
  }

  if (overview.isLoading) return <div className="min-h-screen bg-[#111116] text-[#f8f5ef]"><AppHeader /><main className="grid min-h-[70vh] place-items-center"><p className="font-mono text-xs uppercase tracking-[0.15em] text-[#aaa5af]">Preparing today’s quest…</p></main></div>;
  if (overview.isError || !overview.data) return <div className="min-h-screen bg-[#111116] text-[#f8f5ef]"><AppHeader /><main className="grid min-h-[70vh] place-items-center px-5"><div className="max-w-md text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#d98d75]/15 text-[#edb19b]"><Sparkles className="size-5" /></span><p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">Quest unavailable</p><h1 className="mt-3 font-display text-4xl tracking-[-0.05em]">We could not prepare today’s task.</h1><p className="mt-4 text-[15px] leading-7 text-[#aaa5af]">Your streak is safe. Please retry in a moment, or continue your learning path while we reconnect your daily practice.</p><button onClick={() => overview.refetch()} className="mt-7 rounded-full bg-[#eee8df] px-5 py-3 text-sm font-semibold text-[#19171b]">Retry today’s quest</button><Link href="/curriculum" className="mt-4 block text-sm text-[#cdbdf4] hover:text-[#ded2ff]">Open curriculum instead</Link></div></main><AppFooter /></div>;

  const { task, completion, profile, locked } = overview.data;
  const required = task.task_content.required ?? [];
  const completedLessonIds = new Set(quest.data?.progress.filter((item) => item.status === "completed").map((item) => item.lessonId) ?? []);
  const onComplete = () => {
    const score = required.length ? Math.round((required.filter((fragment) => code.includes(fragment)).length / required.length) * 100) : 100;
    if (score < 100) {
      toast.message(`Keep going — today’s quest still needs: ${required.filter((fragment) => !code.includes(fragment)).join(", ")}.`);
      return;
    }
    complete.mutate({ score, submittedCode: { html: code } });
  };

  return (
    <div className="min-h-screen bg-[#111116] text-[#f8f5ef]">
      <AppHeader />
      <main>
        <section className="border-b border-white/[0.07] bg-[radial-gradient(circle_at_78%_10%,rgba(126,103,216,.20),transparent_25%),#15151b]"><div className="mx-auto max-w-[1180px] px-5 py-10 lg:px-9 lg:py-14"><div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#c8a46e]">Daily coding quest</p><h1 className="mt-3 font-display text-4xl tracking-[-0.05em] sm:text-5xl">{task.title}</h1><p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#aaa5af]">{task.description}</p></div><div className="flex gap-3"><div className="rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-3"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8f8994]">Streak</p><p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#f0bf7b]"><Flame className="size-4" /> {profile.current_streak} day{profile.current_streak === 1 ? "" : "s"}</p></div><div className="rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 py-3"><p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8f8994]">Total XP</p><p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#d4c4ff]"><Sparkles className="size-4" /> {profile.xp}</p></div></div></div></div></section>
        <section className="mx-auto max-w-[1180px] px-5 py-10 lg:px-9 lg:py-14"><div className="mb-6"><BeginnerQuest compact completedLessonIds={completedLessonIds} xp={profile.xp} /></div><div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]"><section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#17171e]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4"><div className="flex items-center gap-2"><span className="rounded-full bg-[#7e67d8]/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-[#cbbcff]">{task.difficulty}</span><span className="inline-flex items-center gap-1.5 text-xs text-[#95909b]"><Clock3 className="size-3.5" /> {task.estimated_minutes} min</span></div><span className="inline-flex items-center gap-1.5 rounded-full border border-[#d7b77f]/25 bg-[#d7b77f]/[0.08] px-2.5 py-1 text-xs font-semibold text-[#e5cc98]"><Trophy className="size-3.5" /> {task.xp_reward} XP</span></div><div className="p-5 sm:p-7"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">Task objective</p><h2 className="mt-3 font-display text-3xl tracking-[-0.04em] text-[#f5f1e9]">{task.task_content.prompt ?? "Complete the focused exercise."}</h2><div className="mt-6 rounded-2xl border border-white/[0.07] bg-[#0d0d12]"><div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3"><span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#bbaee3]">Practice pad</span><span className="text-[11px] text-[#7f7a85]">Your work stays with today’s quest</span></div><textarea value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} className="min-h-[260px] w-full resize-y bg-transparent p-5 font-mono text-[13px] leading-6 text-[#e3d7f6] outline-none" aria-label="Daily coding practice" /></div>{locked ? <div className="mt-5 rounded-2xl border border-[#d7b77f]/25 bg-[#d7b77f]/[0.07] p-5"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 size-4 text-[#e7cb95]" /><div><p className="text-sm font-semibold text-[#f0e7d6]">Full Access quest</p><p className="mt-1 text-sm leading-6 text-[#c0b4a1]">This quest is available with Full Access. It will unlock all lessons past Level 1, project publishing, certificates, and unlimited AI tutor support.</p><Link href="/access" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#eee8df] px-3.5 py-2 text-xs font-semibold text-[#19171b]">View access options <Play className="size-3 fill-current" /></Link></div></div></div> : <button disabled={complete.isPending || completion.state === "completed"} onClick={onComplete} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#7e67d8] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#8d77e6] disabled:cursor-not-allowed disabled:opacity-60">{completion.state === "completed" ? <><CheckCircle2 className="size-4" /> Today’s quest is cleared</> : <><Check className="size-4" /> Clear today’s quest</>}</button>}</div></section><aside className="space-y-5"><section className="rounded-3xl border border-white/[0.08] bg-[#17171e] p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">Quest checklist</p><ol className="mt-5 space-y-4">{required.map((item, index) => <li key={item} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full border border-white/[0.1] font-mono text-[10px] text-[#c3b9d0]">{index + 1}</span><span className={`pt-1 text-sm ${code.includes(item) ? "text-[#a9e0b3] line-through" : "text-[#c9c4ce]"}`}>{item}</span></li>)}</ol>{task.task_content.hint && <div className="mt-6 border-t border-white/[0.07] pt-5"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4ba87]">A gentle nudge</p><p className="mt-2 text-sm leading-6 text-[#aaa5af]">{task.task_content.hint}</p></div>}</section><section className="rounded-3xl border border-white/[0.08] bg-[#17171e] p-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">A rhythm that lasts</p><p className="mt-3 text-sm leading-6 text-[#aaa5af]">Missed yesterday? Begin again with this quest. A streak is encouragement, not a punishment.</p><Link href="/curriculum" className="mt-5 inline-flex text-xs font-semibold text-[#cdbdf4] hover:text-[#ded2ff]">Explore the full curriculum</Link></section></aside></div></section>
      </main>
      <AppFooter />
    </div>
  );
}
