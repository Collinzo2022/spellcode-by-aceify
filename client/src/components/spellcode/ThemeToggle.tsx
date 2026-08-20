import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex size-10 items-center justify-center rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-[#8a74d9] ${isDark ? "border-white/[0.12] bg-white/[0.05] text-[#f8f5ef] hover:bg-white/[0.1]" : "border-[#262334]/15 bg-white/80 text-[#302a40] shadow-sm hover:bg-white"} ${className}`}
    >
      {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </button>
  );
}
