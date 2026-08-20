import { AppFooter } from "@/components/spellcode/AppFooter";
import { AppHeader } from "@/components/spellcode/AppHeader";
import { BeginnerQuest } from "@/components/spellcode/BeginnerQuest";
import { SectionHeading } from "@/components/spellcode/SectionHeading";
import { startAccountCreation } from "@/const";
import { CURRICULUM } from "@shared/curriculum";
import { ArrowRight, BookOpenCheck, Code2, Layers3, Play, Sparkles, TerminalSquare, Trophy } from "lucide-react";
import { Link } from "wouter";

const features = [
  { icon: TerminalSquare, title: "Learn by doing", body: "Every mission ends with a small piece of code you write yourself, not just a video you watch." },
  { icon: Trophy, title: "Feel your progress", body: "Earn XP, protect your streak, and see the next mission waiting as you build momentum." },
  { icon: Layers3, title: "Grow one layer at a time", body: "HTML, CSS, and JavaScript unlock in a sequence that keeps beginners confident." },
];

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#111116] text-[#f8f5ef]">
      <AppHeader />
      <main>
        <section className="spellcode-hero relative isolate overflow-hidden border-b border-white/[0.06]">
          <div className="hero-backdrop pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_20%,rgba(121,91,217,.23),transparent_24%),radial-gradient(circle_at_20%_70%,rgba(209,163,90,.12),transparent_27%),linear-gradient(180deg,#17171f_0%,#111116_75%)]" />
          <div className="pointer-events-none absolute right-[-7rem] top-[-7rem] -z-10 size-[35rem] rounded-full border border-white/[0.05]" />
          <div className="mx-auto grid max-w-[1320px] gap-14 px-5 pb-20 pt-16 lg:grid-cols-[1.02fr_.98fr] lg:px-9 lg:pb-28 lg:pt-28">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#d6b57f]/20 bg-[#d6b57f]/[0.08] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#e6c990]"><Sparkles className="size-3" /> Coding feels easier when it feels like a game</div>
              <h1 className="mt-7 font-display text-[3.35rem] font-medium leading-[.98] tracking-[-0.06em] text-[#f8f5ef] sm:text-7xl">Start small.<br />Build <span className="text-[#cdb7ff]">real skills.</span><br />Keep going.</h1>
              <p className="mt-7 max-w-xl text-[17px] leading-8 text-[#b6b1bb]">SpellCode by Aceify turns beginner web development into short, interactive missions. Learn a concept, write the code, earn XP, and unlock your next win.</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button onClick={startAccountCreation} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f0ebe3] px-5 py-3.5 text-sm font-semibold text-[#18161a] transition hover:bg-white active:scale-[.97]">Start your first mission <Play className="size-4 fill-current" /></button>
                <Link href="/learn/html/html-foundations" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.13] px-5 py-3.5 text-sm font-semibold text-[#e4dfe7] transition hover:border-white/30 hover:bg-white/[0.04]">Try a lesson <BookOpenCheck className="size-4" /></Link>
              </div>
              <div className="mt-11 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/[0.08] pt-6"><span className="inline-flex items-center gap-2 text-sm text-[#a9a4ae]"><span className="size-1.5 rounded-full bg-[#8acc9e]" /> 10–20 minute missions</span><span className="inline-flex items-center gap-2 text-sm text-[#a9a4ae]"><span className="size-1.5 rounded-full bg-[#8b76df]" /> XP and streaks</span><span className="inline-flex items-center gap-2 text-sm text-[#a9a4ae]"><span className="size-1.5 rounded-full bg-[#d1a366]" /> Real code, in browser</span></div>
            </div>
            <div className="relative mx-auto w-full max-w-[590px] lg:pt-5">
              <div className="absolute -inset-8 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(126,103,216,.21),transparent_68%)] blur-2xl" />
              <div className="overflow-hidden rounded-[26px] border border-white/[0.12] bg-[#1a1a22] shadow-[0_30px_90px_rgba(0,0,0,.42)]">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div className="flex gap-1.5"><span className="size-2 rounded-full bg-[#ef9e8e]" /><span className="size-2 rounded-full bg-[#e3c879]" /><span className="size-2 rounded-full bg-[#7dc998]" /></div><span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#87828d]">Mission 01 · HTML</span><Code2 className="size-4 text-[#b9a4ec]" /></div>
                <div className="grid min-h-[360px] grid-cols-[1.04fr_.96fr]"><div className="border-r border-white/[0.07] bg-[#131319] p-5 font-mono text-[11px] leading-6"><p><span className="text-[#827e87]">1</span> <span className="text-[#d9b5ff]">&lt;main&gt;</span></p><p><span className="text-[#827e87]">2</span> &nbsp;<span className="text-[#d9b5ff]">&lt;h1&gt;</span><span className="text-[#f6dea8]">Hello, web</span><span className="text-[#d9b5ff]">&lt;/h1&gt;</span></p><p><span className="text-[#827e87]">3</span> &nbsp;<span className="text-[#d9b5ff]">&lt;p&gt;</span><span className="text-[#b6d9b7]">I am learning.</span><span className="text-[#d9b5ff]">&lt;/p&gt;</span></p><p><span className="text-[#827e87]">4</span> <span className="text-[#d9b5ff]">&lt;/main&gt;</span></p><div className="mt-7 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3 text-[#8d8993]">Mission goal<br /><span className="text-[#d8d2de]">Create your first document.</span></div></div><div className="relative bg-[#eee9df] p-5"><div className="absolute right-4 top-4 rounded-md bg-[#ddd5c8] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#736b61]">Preview</div><div className="mt-10 rounded-xl bg-white p-5 shadow-[0_7px_24px_rgba(88,72,48,.12)]"><div className="size-8 rounded-full bg-[#7e67d8]" /><h2 className="mt-5 font-serif text-xl font-semibold text-[#2c2925]">Hello, web</h2><p className="mt-2 text-xs leading-5 text-[#746d65]">I am learning how the web is built, one small step at a time.</p><button className="mt-5 rounded-lg bg-[#2d2832] px-3 py-2 text-[10px] font-semibold text-white">Mission cleared</button></div><div className="absolute bottom-5 left-5 right-5 flex items-center gap-2 rounded-lg bg-[#302b36] px-3 py-2 text-[10px] text-[#d9c5ff]"><Trophy className="size-3" /> +50 XP earned</div></div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1320px] px-5 py-16 lg:px-9 lg:py-20"><BeginnerQuest /></section>

        <section className="mx-auto max-w-[1320px] px-5 py-20 lg:px-9 lg:py-24"><SectionHeading eyebrow="Designed for first-timers" title="A friendly loop that makes practice stick." body="You never need to guess what to do next. Each small mission explains one idea, gives you a safe place to try it, and celebrates the code you finish." /><div className="mt-12 grid gap-4 md:grid-cols-3">{features.map((feature) => <article key={feature.title} className="group rounded-2xl border border-white/[0.08] bg-[#17171e] p-6 transition duration-200 hover:-translate-y-1 hover:border-white/[0.15] hover:bg-[#1a1a22]"><span className="grid size-10 place-items-center rounded-xl bg-[#7e67d8]/15 text-[#c9b8f2]"><feature.icon className="size-5" /></span><h3 className="mt-7 font-display text-xl font-medium tracking-[-0.03em] text-[#f4f1eb]">{feature.title}</h3><p className="mt-3 text-sm leading-6 text-[#a9a4ae]">{feature.body}</p></article>)}</div></section>

        <section className="border-y border-white/[0.07] bg-[#15151b]"><div className="mx-auto max-w-[1320px] px-5 py-20 lg:px-9 lg:py-24"><div className="flex flex-col justify-between gap-8 md:flex-row md:items-end"><SectionHeading eyebrow="Your full adventure" title="Three languages. One connected journey." body="When your first missions feel comfortable, carry the same momentum from HTML into CSS and JavaScript." /><Link href="/curriculum" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-[#ddc391] transition hover:text-[#ffe1a7]">Open full map <ArrowRight className="size-4" /></Link></div><div className="mt-12 grid gap-4 lg:grid-cols-3">{CURRICULUM.map((track, index) => <article key={track.id} className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111116] p-6"><span className="absolute right-5 top-3 font-display text-7xl font-medium text-white/[0.035]">0{index + 1}</span><span className="inline-flex rounded-full border border-white/[0.09] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: track.color }}>{track.name}</span><h3 className="mt-7 font-display text-2xl tracking-[-0.04em] text-[#f4f1eb]">{track.description}</h3><div className="mt-8 space-y-3">{track.lessons.map((lesson) => <Link key={lesson.id} href={`/learn/${track.id}/${lesson.id}`} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-3 text-sm text-[#c9c4ce] transition hover:border-white/[0.13] hover:bg-white/[0.05]"><span>{lesson.title}</span><ArrowRight className="size-3.5 text-[#817b88]" /></Link>)}</div></article>)}</div></div></section>
      </main>
      <AppFooter />
    </div>
  );
}
