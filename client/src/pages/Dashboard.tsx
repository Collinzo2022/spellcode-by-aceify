import { useAuth } from "@/_core/hooks/useAuth";
import { AppFooter } from "@/components/spellcode/AppFooter";
import { AppHeader } from "@/components/spellcode/AppHeader";
import { BeginnerQuest } from "@/components/spellcode/BeginnerQuest";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { ACHIEVEMENTS, CURRICULUM } from "@shared/curriculum";
import { ArrowRight, Award, BookOpenCheck, CalendarDays, Flame, GraduationCap, Sparkles, Trophy } from "lucide-react";
import { Link } from "wouter";

const statCards = [
  { key: "xp", icon: Sparkles, label: "XP earned", color: "text-[#c9b7fa] bg-[#7e67d8]/15" },
  { key: "streak", icon: Flame, label: "Current streak", color: "text-[#f0b475] bg-[#d98e55]/15" },
  { key: "completed", icon: BookOpenCheck, label: "Lessons completed", color: "text-[#a6dcae] bg-[#76bd89]/15" },
  { key: "achievements", icon: Award, label: "Achievements", color: "text-[#dfc781] bg-[#d2ae61]/15" },
] as const;

export default function Dashboard() {
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  const dashboard = trpc.learning.dashboard.useQuery(undefined, { enabled: isAuthenticated });
  const enroll = trpc.learning.enrollTrack.useMutation({ onSuccess: () => utils.learning.dashboard.invalidate() });

  if (!isAuthenticated) {
    return <div className="min-h-screen bg-[#111116] text-[#f8f5ef]"><AppHeader /><main className="grid min-h-[70vh] place-items-center px-5"><div className="max-w-md text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#7e67d8]/15 text-[#c8b8f0]"><Sparkles className="size-5" /></span><p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">Private learning space</p><h1 className="mt-3 font-display text-4xl tracking-[-0.05em]">Your dashboard is ready when you are.</h1><p className="mt-4 text-[15px] leading-7 text-[#aaa5af]">Sign in to build a personal curriculum, track XP and streaks, and save every lesson and challenge you complete.</p><button onClick={startLogin} className="mt-7 rounded-full bg-[#eee8df] px-5 py-3 text-sm font-semibold text-[#19171b]">Log in to open your dashboard</button></div></main><AppFooter /></div>;
  }

  const data = dashboard.data;
  const completedIds = new Set(data?.progress.filter((item) => item.status === "completed").map((item) => item.lessonId) ?? []);
  const enrolledIds = new Set(data?.enrollments.map((item) => item.trackId) ?? []);
  const enrolledTracks = CURRICULUM.filter((track) => enrolledIds.has(track.id));
  const xp = data?.stats?.xp ?? 0;
  const streak = data?.stats?.streak ?? 0;
  const completed = data?.stats?.completedLessons ?? 0;
  const achievements = data?.achievements ?? [];
  const next = enrolledTracks.flatMap((track) => track.lessons.map((lesson) => ({ lesson, track }))).find((item) => !completedIds.has(item.lesson.id));
  const statValues = { xp, streak: `${streak} day${streak === 1 ? "" : "s"}`, completed, achievements: achievements.length };

  return (
    <div className="min-h-screen bg-[#111116] text-[#f8f5ef]">
      <AppHeader />
      <main>
        <section className="border-b border-white/[0.07] bg-[radial-gradient(circle_at_76%_0%,rgba(126,103,216,.19),transparent_24%),#15151b]"><div className="mx-auto max-w-[1320px] px-5 py-12 lg:px-9 lg:py-16"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#c8a46e]">Learning dashboard</p><h1 className="mt-3 font-display text-4xl tracking-[-0.05em] text-[#f7f4ee] sm:text-5xl">Welcome back, {user?.name?.split(" ")[0] ?? "learner"}.</h1><p className="mt-3 max-w-xl text-[15px] leading-7 text-[#aaa5af]">Your real completions, XP, and next mission live here.</p></div></section>
        <section className="mx-auto max-w-[1320px] px-5 py-10 lg:px-9 lg:py-14">
          {dashboard.isLoading ? <p className="py-20 text-center font-mono text-xs uppercase tracking-[0.15em] text-[#aaa5af]">Loading your mission map…</p> : <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{statCards.map((stat) => <article key={stat.key} className="rounded-2xl border border-white/[0.08] bg-[#17171e] p-5"><span className={`grid size-9 place-items-center rounded-xl ${stat.color}`}><stat.icon className="size-4" /></span><p className="mt-6 font-display text-3xl tracking-[-0.04em] text-[#f4f1eb]">{statValues[stat.key]}</p><p className="mt-1 text-sm text-[#96919c]">{stat.label}</p></article>)}</div>
            <div className="mt-6"><BeginnerQuest completedLessonIds={completedIds} xp={xp} /></div>
            <section className="mt-6 rounded-2xl border border-white/[0.08] bg-[#17171e] p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">Build your path</p><h2 className="mt-2 font-display text-2xl tracking-[-0.04em]">Choose the tracks you want to master.</h2><p className="mt-2 text-sm text-[#9e99a4]">Your enrolled tracks shape the lessons shown below.</p></div><div className="flex flex-wrap gap-2">{CURRICULUM.map((track) => <button key={track.id} disabled={enrolledIds.has(track.id) || enroll.isPending} onClick={() => enroll.mutate({ trackId: track.id })} className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${enrolledIds.has(track.id) ? "border border-white/[0.1] bg-white/[0.06] text-[#aaa5af]" : "bg-[#eee8df] text-[#19171b] hover:bg-white"}`}>{enrolledIds.has(track.id) ? `${track.name} added` : `Add ${track.name}`}</button>)}</div></div></section>
            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.7fr)]"><section className="rounded-2xl border border-white/[0.08] bg-[#17171e] p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">Continue learning</p><h2 className="mt-2 font-display text-2xl tracking-[-0.04em]">Your tracks</h2></div><GraduationCap className="size-5 text-[#a998d5]" /></div>{enrolledTracks.length ? <div className="mt-6 space-y-5">{enrolledTracks.map((track) => { const done = track.lessons.filter((lesson) => completedIds.has(lesson.id)).length; const percent = Math.round((done / track.lessons.length) * 100); const nextLesson = track.lessons.find((lesson) => !completedIds.has(lesson.id)) ?? track.lessons[track.lessons.length - 1]; return <div key={track.id} className="rounded-xl border border-white/[0.06] bg-black/[0.12] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold" style={{ color: track.color }}>{track.name}</p><p className="mt-1 text-xs text-[#8e8993]">{done} of {track.lessons.length} lessons complete</p></div><Link href={`/learn/${track.id}/${nextLesson.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#ded1ff]">{done === track.lessons.length ? "Review" : "Resume"}<ArrowRight className="size-3" /></Link></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, backgroundColor: track.color }} /></div></div>; })}</div> : <div className="mt-6 rounded-xl border border-dashed border-white/[0.11] px-6 py-12 text-center"><p className="font-display text-2xl text-[#e8e3eb]">Start with HTML.</p><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#918c97]">Add HTML above to make your real beginner quest map part of your personal learning path.</p></div>}</section><aside className="rounded-2xl border border-white/[0.08] bg-[#17171e] p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">Next up</p><h2 className="mt-2 font-display text-2xl tracking-[-0.04em]">A focused win</h2></div><CalendarDays className="size-5 text-[#d7b77f]" /></div>{next ? <div className="mt-6 rounded-xl border border-[#d7b77f]/20 bg-[#d7b77f]/[0.07] p-5"><span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: next.track.color }}>{next.track.name} · {next.lesson.difficulty}</span><h3 className="mt-3 font-display text-xl text-[#f2eee6]">{next.lesson.title}</h3><p className="mt-2 text-sm leading-6 text-[#aaa39b]">{next.lesson.objective}</p><Link href={`/learn/${next.track.id}/${next.lesson.id}`} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#eee7da] px-3.5 py-2 text-xs font-semibold text-[#211d21]">Open lesson <ArrowRight className="size-3.5" /></Link></div> : <div className="mt-6 rounded-xl border border-white/[0.07] bg-black/[0.1] p-5 text-sm leading-6 text-[#aaa5af]">Add HTML to set your first mission, then complete it to open the next one.</div>}<div className="mt-6 border-t border-white/[0.07] pt-5"><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#85808a]">Recent activity</p>{data?.activity?.length ? <div className="mt-3 space-y-3">{data.activity.slice(0, 3).map((item) => <div key={item.id} className="flex gap-3"><span className="mt-1.5 size-1.5 rounded-full bg-[#907ada]" /><div><p className="text-xs font-medium text-[#dcd7e0]">{item.title}</p><p className="mt-1 text-xs text-[#88838e]">{item.detail}</p></div></div>)}</div> : <p className="mt-3 text-xs leading-5 text-[#88838e]">Your added tracks, completed missions, and challenge activity will appear here.</p>}</div></aside></div>
            <section className="mt-10 rounded-2xl border border-white/[0.08] bg-[#17171e] p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">Earned achievements</p><h2 className="mt-2 font-display text-2xl tracking-[-0.04em]">Badges that mark real momentum</h2></div><Trophy className="size-5 text-[#d7b77f]" /></div><div className="mt-6 grid gap-3 md:grid-cols-3">{ACHIEVEMENTS.map((badge) => { const earned = achievements.some((item) => item.achievementId === badge.id); return <div key={badge.id} className={`rounded-xl border p-4 ${earned ? "border-[#d7b77f]/25 bg-[#d7b77f]/[0.08]" : "border-white/[0.06] bg-black/[0.1] opacity-55"}`}><span className={`grid size-8 place-items-center rounded-lg ${earned ? "bg-[#d7b77f]/15 text-[#ebd096]" : "bg-white/[0.06] text-[#85808b]"}`}><Award className="size-4" /></span><p className="mt-4 text-sm font-semibold text-[#e6e1e8]">{badge.name}</p><p className="mt-1 text-xs leading-5 text-[#94909a]">{badge.description}</p></div>; })}</div></section>
          </>}
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
