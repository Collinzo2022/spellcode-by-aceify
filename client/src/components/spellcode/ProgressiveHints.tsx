import { Lightbulb } from "lucide-react";
import { useState } from "react";

export function ProgressiveHints({ hint, example }: { hint: string; example: string }) {
  const [level, setLevel] = useState(0);
  const messages = [hint, "Check each required chip above one at a time. Match the structure first, then improve the details."];
  return (
    <div className="mt-5">
      {level === 0 ? (
        <button onClick={() => setLevel(1)} className="inline-flex items-center gap-2 text-xs font-medium text-[#e1c38d] transition hover:text-[#ffe0a5]"><Lightbulb className="size-3.5" /> Reveal a nudge</button>
      ) : (
        <div className="rounded-xl bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3"><p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#e2c58f]">Hint {Math.min(level, 2)} of 2</p>{level < 2 && <button onClick={() => setLevel(2)} className="text-[11px] font-medium text-[#eed8aa] hover:text-[#ffe6b4]">Need more?</button>}</div>
          <p className="mt-2 text-xs leading-5 text-[#dfd6c7]">{messages[level - 1]}</p>
          {level === 2 && <button onClick={() => setLevel(3)} className="mt-3 text-[11px] font-medium text-[#eed8aa] hover:text-[#ffe6b4]">Reveal a reference solution</button>}
          {level === 3 && <pre className="mt-3 overflow-x-auto rounded-lg border border-white/[0.07] bg-[#0b0b0e] p-3 font-mono text-[10px] leading-5 text-[#ddc9ff]"><code>{example}</code></pre>}
        </div>
      )}
    </div>
  );
}
