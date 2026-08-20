import { useAuth } from "@/_core/hooks/useAuth";
import { startAccountCreation, startLogin } from "@/const";
import { useTheme } from "@/contexts/ThemeContext";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";

const navigation = [
  { label: "Today", href: "/today" },
  { label: "Curriculum", href: "/curriculum" },
  { label: "Projects", href: "/projects" },
  { label: "Dashboard", href: "/dashboard" },
];

export function AppHeader() {
  const [location] = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const isDark = theme === "dark";
  const activeClass = isDark ? "bg-white/[0.08] text-white" : "bg-[#302a40]/[0.08] text-[#2c2639]";
  const inactiveClass = isDark ? "text-[#aaa6b1] hover:text-white" : "text-[#6a6277] hover:text-[#2c2639]";
  const headerClass = isDark
    ? "border-white/[0.06] bg-[#111116]/80"
    : "border-[#312a41]/10 bg-[#f9f7fc]/85 shadow-[0_1px_0_rgba(47,39,67,.04)]";

  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${headerClass}`}>
      <div className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between px-5 lg:px-9">
        <BrandMark />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={`rounded-full px-4 py-2 text-sm transition-colors ${location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href)) ? activeClass : inactiveClass}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          {isAuthenticated ? (
            <>
              <Link href="/profile" className={`text-sm transition-colors ${isDark ? "text-[#beb9c4] hover:text-white" : "text-[#5e566c] hover:text-[#2c2639]"}`}>{user?.name ?? "Profile"}</Link>
              <button onClick={() => logout()} className={`rounded-full border px-4 py-2 text-sm transition ${isDark ? "border-white/10 text-[#d2ced7] hover:border-white/25 hover:text-white" : "border-[#312a41]/15 text-[#514960] hover:border-[#312a41]/30 hover:text-[#2c2639]"}`}>Sign out</button>
            </>
          ) : (
            <>
              <button onClick={startLogin} className={`px-3 text-sm transition ${isDark ? "text-[#c8c3cd] hover:text-white" : "text-[#5e566c] hover:text-[#2c2639]"}`}>Log in</button>
              <button onClick={startAccountCreation} className="rounded-full bg-[#7e67d8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6d56c5] active:scale-[.97]">Create account</button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button onClick={() => setOpen((value) => !value)} className={`grid size-10 place-items-center rounded-xl border ${isDark ? "border-white/10 text-white" : "border-[#312a41]/15 text-[#2c2639]"}`} aria-label="Toggle navigation">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className={`border-t px-5 py-4 md:hidden ${isDark ? "border-white/[0.06] bg-[#15151b]" : "border-[#312a41]/10 bg-[#f9f7fc]"}`}>
          <nav className="flex flex-col gap-1" aria-label="Mobile navigation">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`rounded-xl px-3 py-3 text-sm ${isDark ? "text-[#d5d1da] hover:bg-white/[0.06]" : "text-[#4d455a] hover:bg-[#302a40]/[0.06]"}`}>
                {item.label}
              </Link>
            ))}
            {!isAuthenticated && <button onClick={startAccountCreation} className="mt-2 rounded-xl bg-[#7e67d8] px-3 py-3 text-sm font-semibold text-white">Create account</button>}
          </nav>
        </div>
      )}
    </header>
  );
}
