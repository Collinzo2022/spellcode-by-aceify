import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useTheme } from "@/contexts/ThemeContext";
import { validateChallenge } from "@/lib/challenge";
import { trpc } from "@/lib/trpc";
import type { LessonDefinition } from "@shared/curriculum";
import { Check, ChevronLeft, ChevronRight, Code2, Eye, LockKeyhole, Monitor, RotateCcw, Smartphone, Tablet, Terminal, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { ProgressiveHints } from "./ProgressiveHints";

type Device = "desktop" | "tablet" | "mobile";
type EditorTab = "HTML" | "CSS" | "JavaScript";

function starterFor(lesson: LessonDefinition) {
  if (lesson.id === "html-foundations") return { html: "<main>\n  <h1>Hello, web</h1>\n  <p>I am learning HTML.</p>\n</main>", css: "main {\n  max-width: 36rem;\n  margin: 4rem auto;\n  font-family: system-ui;\n}", js: "" };
  if (lesson.id.startsWith("css")) return { html: "<main class=\"card\">\n  <h1>Design with intent</h1>\n  <p>Small systems make confident interfaces.</p>\n</main>", css: "body {\n  background: #f6f3ed;\n}\n\n.card {\n  padding: 2rem;\n  background: white;\n}", js: "" };
  return { html: "<main>\n  <h1 id=\"title\">Ready to learn</h1>\n  <button id=\"action\">Try it</button>\n</main>", css: "body {\n  font-family: system-ui;\n  padding: 2rem;\n}\n\nbutton {\n  padding: .7rem 1rem;\n}", js: "const button = document.querySelector('#action');\nbutton.addEventListener('click', () => {\n  console.log('Nice work!');\n});" };
}

export function LessonWorkspace({ lesson, track }: { lesson: LessonDefinition; track: "HTML" | "CSS" | "JavaScript" }) {
  const { isAuthenticated } = useAuth();
  const { theme } = useTheme();
  const utils = trpc.useUtils();
  const access = trpc.billing.myAccess.useQuery(undefined, { enabled: isAuthenticated });
  const quest = trpc.learning.dashboard.useQuery(undefined, { enabled: isAuthenticated });
  const defaults = useMemo(() => starterFor(lesson), [lesson]);
  const [html, setHtml] = useState(defaults.html);
  const [css, setCss] = useState(defaults.css);
  const [js, setJs] = useState(defaults.js);
  const [tab, setTab] = useState<EditorTab>("HTML");
  const [device, setDevice] = useState<Device>("desktop");
  const [result, setResult] = useState<ReturnType<typeof validateChallenge> | null>(null);
  const completeLesson = trpc.learning.completeLesson.useMutation({ onSuccess: response => { utils.learning.dashboard.invalidate(); toast.success(response.awardedXp ? `Mission cleared — ${response.awardedXp} XP earned. Your quest map is updated.` : "Lesson completion saved. Your quest map is updated."); }, onError: () => toast.error("We could not save your lesson completion.") });
  const submitChallenge = trpc.learning.submitChallenge.useMutation();

  const preview = useMemo(() => `<!doctype html><html><head><style>html,body{min-height:100%;margin:0}*{box-sizing:border-box}${css}</style></head><body>${html}<script>${js.split("</script>").join("<\\/script")}</script></body></html>`, [html, css, js]);
  const selectedCode = tab === "HTML" ? html : tab === "CSS" ? css : js;
  const updateCode = (value: string) => tab === "HTML" ? setHtml(value) : tab === "CSS" ? setCss(value) : setJs(value);
  const deviceClass = device === "desktop" ? "w-full" : device === "tablet" ? "mx-auto max-w-[760px]" : "mx-auto max-w-[375px]";
  const beginnerMissionIds = ["html-foundations", "html-semantic-layout", "css-visual-language"];
  const isBeginnerMission = beginnerMissionIds.includes(lesson.id);
  const completedMissionCount = quest.data?.progress.filter(item => item.status === "completed" && beginnerMissionIds.includes(item.lessonId)).length ?? 0;

  function validate() {
    const next = validateChallenge(lesson.challenge.required, `${html}\n${css}\n${js}`);
    setResult(next);
    if (isAuthenticated) submitChallenge.mutate({ challengeId: lesson.id, score: next.score, passed: next.passed, summary: next.passed ? `Passed ${lesson.title}.` : `Worked on ${lesson.title}.` });
    next.passed ? toast.success(isAuthenticated ? "All checks passed — 20 XP added." : "All checks passed. Sign in to save 20 XP.") : toast.message("A few checks still need attention.");
  }

  function markComplete() {
    if (!isAuthenticated) { toast.message("Sign in to save your progress."); startLogin(); return; }
    if (!result?.passed) { toast.message("Pass the challenge before marking this lesson complete."); return; }
    completeLesson.mutate({ lessonId: lesson.id, track, difficulty: lesson.difficulty, xp: lesson.xp });
  }

  const requiresFullAccess = lesson.order > 1;
  const locked = requiresFullAccess && (!isAuthenticated || (!access.isLoading && !access.data?.hasFullAccess));
  if (locked) return <div className="grid min-h-screen place-items-center bg-[#111116] px-5 text-white"><div className="max-w-lg text-center"><Link href="/curriculum" className="inline-flex items-center gap-2 text-sm text-[#aaa6b1] hover:text-white"><ChevronLeft className="size-4" /> Curriculum</Link><span className="mx-auto mt-10 grid size-12 place-items-center rounded-2xl border border-[#d7b77f]/25 bg-[#d7b77f]/[0.08] text-[#e8cf9e]"><LockKeyhole className="size-5" /></span><p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">Full Access lesson</p><h1 className="mt-3 font-display text-4xl tracking-[-0.05em]">Continue your path with Full Access.</h1><p className="mt-4 text-[15px] leading-7 text-[#aaa5af]">{lesson.title} is available after Level 1. Full Access also includes project publishing, certificates, and unlimited AI tutor support.</p><Link href="/access" className="mt-7 inline-flex rounded-full bg-[#eee8df] px-5 py-3 text-sm font-semibold text-[#19171b]">View Full Access options</Link></div></div>;

  return <div className={`min-h-screen ${theme === "dark" ? "bg-[#111116] text-white" : "lesson-light bg-[#fbf9fe] text-[#2e2739]"}`}>
    <div className="border-b border-white/[0.07] bg-[#15151b]"><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 lg:px-6"><Link href="/curriculum" className="inline-flex items-center gap-2 text-sm text-[#aaa6b1] transition hover:text-white"><ChevronLeft className="size-4" /> Curriculum</Link><div className="hidden items-center gap-2 sm:flex"><span className="rounded-full bg-white/[0.07] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#d4c4ff]">{track}</span>{isBeginnerMission && isAuthenticated && <span className="rounded-full border border-[#e5c98e]/20 bg-[#e5c98e]/[0.08] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#ead29e]">Quest {completedMissionCount}/3</span>}<span className="text-sm text-[#e7e3ec]">{lesson.title}</span></div><button onClick={markComplete} disabled={completeLesson.isPending} className="inline-flex items-center gap-2 rounded-full bg-[#ede8df] px-3.5 py-2 text-xs font-semibold text-[#19171c] transition hover:bg-white disabled:opacity-60"><Trophy className="size-3.5" /> {isBeginnerMission ? "Clear mission" : "Complete lesson"}</button></div></div>
    <main className="mx-auto grid max-w-[1500px] lg:grid-cols-[minmax(330px,0.43fr)_minmax(0,0.57fr)]">
      <aside className="border-b border-white/[0.07] bg-[#121217] lg:min-h-[calc(100vh-57px)] lg:border-b-0 lg:border-r"><div className="mx-auto max-w-[620px] px-6 py-10 lg:px-10"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#c8a46e]">{lesson.difficulty} · {lesson.duration}</p><h1 className="mt-4 font-display text-4xl font-medium tracking-[-0.045em] text-[#f8f5ef]">{lesson.title}</h1><p className="mt-4 text-[15px] leading-7 text-[#b1adb7]">{lesson.description}</p><section className="mt-9 border-y border-white/[0.07] py-7"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#85808b]">The idea</p><p className="mt-3 text-[15px] leading-7 text-[#d0cbd4]">{lesson.theory}</p></section><section className="mt-8"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#85808b]">Guided example</p><pre className="mt-3 overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#0b0b0e] p-4 font-mono text-[12px] leading-6 text-[#ddc9ff]"><code>{lesson.example}</code></pre></section><section className="mt-8 rounded-2xl border border-[#c7a676]/20 bg-[#c7a676]/[0.07] p-5"><div className="flex items-center gap-2 text-[#efd6a8]"><Code2 className="size-4" /><p className="font-mono text-[10px] uppercase tracking-[0.16em]">Your challenge</p></div><p className="mt-3 text-sm leading-6 text-[#eee7db]">{lesson.challenge.prompt}</p><div className="mt-4 flex flex-wrap gap-2">{lesson.challenge.required.map(item => <span key={item} className="rounded-full border border-[#e8d2a7]/15 px-2.5 py-1 font-mono text-[10px] text-[#e4c99b]">{item}</span>)}</div><ProgressiveHints hint={lesson.challenge.hint} example={lesson.example} /></section></div></aside>
      <section className="min-w-0 bg-[#0f0f13] p-4 sm:p-6"><div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#17171e] shadow-[0_24px_60px_rgba(0,0,0,.24)]"><div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-3 sm:px-4"><div className="flex min-w-0 overflow-x-auto">{(["HTML", "CSS", "JavaScript"] as EditorTab[]).map(item => <button key={item} onClick={() => setTab(item)} className={`relative shrink-0 px-3 py-3.5 font-mono text-[11px] transition ${tab === item ? "text-white" : "text-[#77737d] hover:text-[#c9c4cf]"}`}>{item}{tab === item && <span className="absolute inset-x-3 bottom-0 h-px bg-[#d7b07a]" />}</button>)}</div><button onClick={() => { setHtml(defaults.html); setCss(defaults.css); setJs(defaults.js); setResult(null); }} className="hidden items-center gap-1.5 text-[11px] text-[#8f8a95] transition hover:text-white sm:inline-flex"><RotateCcw className="size-3.5" /> Reset</button></div><div className="relative min-h-[360px] bg-[#101015]"><div className="absolute inset-y-0 left-0 w-11 border-r border-white/[0.05] bg-[#131319] pt-4 text-right font-mono text-[11px] leading-6 text-[#4d4a52]">{Array.from({ length: Math.max(14, selectedCode.split("\n").length) }, (_, index) => <div className="pr-3" key={index}>{index + 1}</div>)}</div><textarea value={selectedCode} onChange={event => updateCode(event.target.value)} spellCheck={false} className="absolute inset-0 w-full resize-none bg-transparent py-4 pl-[3.75rem] pr-5 font-mono text-[12px] leading-6 text-[#e3d7f6] outline-none" aria-label={`${tab} editor`} /></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] bg-[#15151b] px-4 py-3"><div className="flex items-center gap-2"><Terminal className="size-3.5 text-[#a99bc9]" /><span className="font-mono text-[10px] uppercase tracking-[0.13em] text-[#85808b]">Edits update your preview live</span></div><button onClick={validate} className="inline-flex items-center gap-2 rounded-full bg-[#7e67d8] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#8b75e6] active:scale-[.97]"><Check className="size-3.5" /> Run checks</button></div></div><div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#17171e] shadow-[0_24px_60px_rgba(0,0,0,.18)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3"><div className="flex items-center gap-2"><Eye className="size-3.5 text-[#b1a1d9]" /><span className="font-mono text-[10px] uppercase tracking-[0.13em] text-[#9f9aa4]">Live preview</span></div><div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-[#101015] p-1">{([{ id: "desktop", icon: Monitor }, { id: "tablet", icon: Tablet }, { id: "mobile", icon: Smartphone }] as const).map(({ id, icon: Icon }) => <button key={id} onClick={() => setDevice(id)} className={`grid size-7 place-items-center rounded-md transition ${device === id ? "bg-white/[0.12] text-white" : "text-[#77737d] hover:text-white"}`} aria-label={`${id} preview`}><Icon className="size-3.5" /></button>)}</div></div><div className="min-h-[360px] bg-[#e9e5dd] p-4 sm:p-6"><iframe title="Live lesson preview" sandbox="allow-scripts" srcDoc={preview} className={`h-[330px] rounded-lg bg-white shadow-[0_8px_30px_rgba(0,0,0,.12)] transition-all ${deviceClass}`} /></div></div>{result && <div className={`mt-5 rounded-2xl border p-4 ${result.passed ? "border-[#7dca9b]/25 bg-[#7dca9b]/[0.09]" : "border-[#e1a277]/25 bg-[#e1a277]/[0.08]"}`}><div className="flex items-center gap-3"><span className={`grid size-7 place-items-center rounded-full ${result.passed ? "bg-[#7dca9b]/20 text-[#a2e7ba]" : "bg-[#e1a277]/20 text-[#f2ba94]"}`}>{result.passed ? <Check className="size-4" /> : <ChevronRight className="size-4" />}</span><div><p className="text-sm font-semibold text-[#f1eee9]">{result.passed ? "Challenge passed" : "Keep refining"} <span className="ml-1 font-mono text-[11px] font-normal text-[#beb8c1]">{result.score}%</span></p><p className="mt-1 text-xs text-[#aaa5af]">{result.passed ? (isAuthenticated ? "All checks passed — 20 XP has been added to your progress." : "All checks passed — sign in to save your 20 XP.") : `Still looking for: ${result.missing.join(", ")}.`}</p></div></div></div>}</section>
    </main>
  </div>;
}
