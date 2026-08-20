import { CURRICULUM } from "@shared/curriculum";
import { ArrowRight, CheckCircle2, Flag, LockKeyhole, Play, Sparkles, Star } from "lucide-react";
import { Link } from "wouter";

const htmlLessons = CURRICULUM.find((track) => track.id === "html")?.lessons ?? [];
const cssLessons = CURRICULUM.find((track) => track.id === "css")?.lessons ?? [];
const allMissions = [
  { lesson: htmlLessons[0], track: "HTML", trackId: "html", color: "#e7815d", icon: Flag },
  { lesson: htmlLessons[1], track: "HTML", trackId: "html", color: "#e7815d", icon: Star },
  { lesson: cssLessons[0], track: "CSS", trackId: "css", color: "#7767d8", icon: Sparkles },
].filter((mission): mission is { lesson: NonNullable<typeof mission.lesson>; track: string; trackId: string; color: string; icon: typeof Flag } => Boolean(mission.lesson));

type BeginnerQuestProps = {
  compact?: boolean;
  completedLessonIds?: Set<string>;
  xp?: number;
};

export function BeginnerQuest({ compact = false, completedLessonIds, xp = 0 }: BeginnerQuestProps) {
  const completedMissionCount = allMissions.filter((mission) => completedLessonIds?.has(mission.lesson.id)).length;
  const currentMissionIndex = completedLessonIds ? allMissions.findIndex((mission) => !completedLessonIds.has(mission.lesson.id)) : 0;
  const progressLabel = completedLessonIds ? `${completedMissionCount} of ${allMissions.length} missions cleared` : "Your first three missions";

  return (
    <section className={`beginner-quest relative overflow-hidden rounded-[28px] border border-white/[0.11] bg-[linear-gradient(135deg,rgba(126,103,216,.20),rgba(26,24,36,.96)_44%,rgba(214,173,104,.12))] ${compact ? "p-5" : "p-6 sm:p-9"}`}>
      <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full border border-white/[0.1]" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#e6c990]">Beginner quest map</p>
          <h2 className="mt-3 font-display text-3xl tracking-[-0.05em] text-[#f8f5ef] sm:text-4xl">Tiny missions. Real skills. Visible wins.</h2>
          <p className="mt-3 text-sm leading-6 text-[#beb8c5]">Start with one short mission, write real code, and earn XP as your path opens. There are no long videos or blank pages to figure out alone.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e6c990]/25 bg-[#e6c990]/[0.1] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.13em] text-[#ebd5aa]"><Sparkles className="size-3" /> {progressLabel}</span>
          {completedLessonIds && <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/[0.14] bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-[#f4edff]"><Star className="size-3 fill-current text-[#e5c98e]" /> {xp} XP</span>}
        </div>
      </div>

      <div className="relative mt-7 grid gap-3 md:grid-cols-3">
        {allMissions.map((mission, index) => {
          const MissionIcon = mission.icon;
          const isCompleted = Boolean(completedLessonIds?.has(mission.lesson.id));
          const isCurrent = currentMissionIndex === index;
          const isUpcoming = currentMissionIndex !== -1 && index > currentMissionIndex;
          const status = isCompleted ? "Cleared" : isCurrent ? "Play now" : "Coming up";
          return (
            <article key={mission.lesson.id} className={`group relative rounded-2xl border p-5 transition duration-200 ${isCurrent ? "border-white/[0.18] bg-white/[0.08] shadow-[0_16px_36px_rgba(6,5,13,.18)]" : "border-white/[0.09] bg-black/[0.12] hover:-translate-y-1 hover:border-white/[0.18]"}`}>
              <div className="flex items-center justify-between">
                <span className="grid size-9 place-items-center rounded-xl border border-white/[0.12] bg-black/10" style={{ color: mission.color }}>{isCompleted ? <CheckCircle2 className="size-4 text-[#91d4a0]" /> : <MissionIcon className="size-4" />}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#aaa3b2]">Mission 0{index + 1}</span>
              </div>
              <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: mission.color }}>{mission.track} · {mission.lesson.duration}</p>
              <h3 className="mt-2 font-display text-xl tracking-[-0.035em] text-[#f5f1eb]">{mission.lesson.title}</h3>
              <p className="mt-2 min-h-12 text-sm leading-5 text-[#afa9b7]">{mission.lesson.objective}</p>
              <div className="mt-5 flex items-center justify-between border-t border-white/[0.09] pt-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#e3cb98]"><Star className="size-3.5 fill-current" /> {isCompleted ? "XP claimed" : `${mission.lesson.xp} XP`}</span>
                {isUpcoming ? <span className="inline-flex items-center gap-1 text-xs text-[#a8a1af]"><LockKeyhole className="size-3" /> {status}</span> : <Link href={`/learn/${mission.trackId}/${mission.lesson.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#f8f5ef] hover:text-[#e6c990]">{isCompleted ? "Replay" : <><Play className="size-3 fill-current" /> {status}</>}<ArrowRight className="size-3.5" /></Link>}
              </div>
            </article>
          );
        })}
      </div>

      {!compact && <div className="relative mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#b9b2c0]"><span className="inline-flex items-center gap-2"><CheckCircle2 className="size-3.5 text-[#8fd09f]" /> Each cleared mission updates your dashboard</span><span className="inline-flex items-center gap-2"><Star className="size-3.5 text-[#e5c98e]" /> Keep every XP point you earn</span></div>}
    </section>
  );
}
