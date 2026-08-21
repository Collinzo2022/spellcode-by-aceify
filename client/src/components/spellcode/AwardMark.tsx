import { Code2, Compass, Flame, Hammer, Sparkles, Star } from "lucide-react";

const icons = { spark: Sparkles, code: Code2, flame: Flame, star: Star, hammer: Hammer, compass: Compass } as const;

export function AwardMark({ iconKey, className = "size-4" }: { iconKey?: keyof typeof icons; className?: string }) {
  const Icon = icons[iconKey ?? "spark"];
  return <Icon className={className} />;
}
