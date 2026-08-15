import { BrandMark } from "./BrandMark";

export function AppFooter() {
  return <footer className="border-t border-white/[0.07] bg-[#0d0d11]"><div className="mx-auto flex max-w-[1320px] flex-col gap-8 px-5 py-10 sm:flex-row sm:items-center sm:justify-between lg:px-9"><BrandMark /><p className="max-w-md text-sm leading-6 text-[#85818b]">A focused, browser-based place to learn the building blocks of the modern web.</p><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#706b75]">© 2026 SpellCode by Aceify</p></div></footer>;
}
