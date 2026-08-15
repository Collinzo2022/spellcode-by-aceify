import { Sparkles } from "lucide-react";
import { Link } from "wouter";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5 text-left" aria-label="SpellCode by Aceify home">
      <span className="relative grid size-9 place-items-center overflow-hidden rounded-xl border border-white/10 bg-[#1d1d25] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_10px_25px_rgba(0,0,0,.25)] transition-transform duration-200 group-hover:-rotate-3">
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_28%_20%,rgba(210,192,255,.35),transparent_38%),linear-gradient(135deg,rgba(126,96,255,.35),transparent_70%)]" />
        <Sparkles className="relative size-4 text-[#e5d8ff]" strokeWidth={1.8} />
      </span>
      {!compact && <span className="leading-none"><span className="block font-display text-[15px] font-semibold tracking-[-0.03em] text-[#f9f7f1]">SpellCode</span><span className="mt-1 block font-mono text-[8px] font-medium uppercase tracking-[0.2em] text-[#a9a4b1]">by Aceify</span></span>}
    </Link>
  );
}
