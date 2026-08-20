import { useTheme } from "@/contexts/ThemeContext";
import { BrandMark } from "./BrandMark";

export function AppFooter() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <footer className={`border-t ${isDark ? "border-white/[0.07] bg-[#0d0d11]" : "border-[#312a41]/10 bg-[#ece9f3]"}`}>
      <div className="mx-auto flex max-w-[1320px] flex-col gap-8 px-5 py-10 sm:flex-row sm:items-center sm:justify-between lg:px-9">
        <BrandMark />
        <p className={`max-w-md text-sm leading-6 ${isDark ? "text-[#85818b]" : "text-[#655c72]"}`}>A focused, browser-based place to learn the building blocks of the modern web.</p>
        <p className={`font-mono text-[10px] uppercase tracking-[0.16em] ${isDark ? "text-[#706b75]" : "text-[#706779]"}`}>© 2026 SpellCode by Aceify</p>
      </div>
    </footer>
  );
}
