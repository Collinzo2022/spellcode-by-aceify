export function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return <div className="max-w-2xl"><p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#c7a676]">{eyebrow}</p><h2 className="font-display text-3xl font-medium tracking-[-0.045em] text-[#f8f5ef] sm:text-4xl">{title}</h2>{body && <p className="mt-4 text-[15px] leading-7 text-[#aca8b1]">{body}</p>}</div>;
}
