import { LessonWorkspace } from "@/components/spellcode/LessonWorkspace";
import { CURRICULUM } from "@shared/curriculum";
import { Link, useParams } from "wouter";

export default function Lesson() {
  const params = useParams<{ track: string; lessonId: string }>();
  const track = CURRICULUM.find(item => item.id === params.track);
  const lesson = track?.lessons.find(item => item.id === params.lessonId);
  if (!track || !lesson) return <div className="grid min-h-screen place-items-center bg-[#111116] px-6 text-center text-white"><div><p className="font-display text-3xl">This lesson is not on the map yet.</p><Link href="/curriculum" className="mt-5 inline-block text-sm text-[#d0b377]">Return to curriculum</Link></div></div>;
  return <LessonWorkspace lesson={lesson} track={track.name} />;
}

