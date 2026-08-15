import { useAuth } from "@/_core/hooks/useAuth";
import { startAccountCreation, startLogin } from "@/const";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { BrandMark } from "./BrandMark";

const navigation = [{ label: "Today", href: "/today" }, { label: "Curriculum", href: "/curriculum" }, { label: "Projects", href: "/projects" }, { label: "Dashboard", href: "/dashboard" }];

export function AppHeader() {
  const [location] = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#111116]/80 backdrop-blur-xl"><div className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between px-5 lg:px-9"><BrandMark /><nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">{navigation.map(item => <Link key={item.href} href={item.href} className={`rounded-full px-4 py-2 text-sm transition-colors ${location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href)) ? "bg-white/[0.08] text-white" : "text-[#aaa6b1] hover:text-white"}`}>{item.label}</Link>)}</nav><div className="hidden items-center gap-3 md:flex">{isAuthenticated ? <><Link href="/profile" className="text-sm text-[#beb9c4] transition-colors hover:text-white">{user?.name ?? "Profile"}</Link><button onClick={() => logout()} className="rounded-full border border-white/10 px-4 py-2 text-sm text-[#d2ced7] transition hover:border-white/25 hover:text-white">Sign out</button></> : <><button onClick={startLogin} className="px-3 text-sm text-[#c8c3cd] transition hover:text-white">Log in</button><button onClick={startAccountCreation} className="rounded-full bg-[#f1ede7] px-4 py-2 text-sm font-semibold text-[#161419] transition hover:bg-white active:scale-[.97]">Create account</button></>}</div><button onClick={() => setOpen(value => !value)} className="grid size-10 place-items-center rounded-xl border border-white/10 text-white md:hidden" aria-label="Toggle navigation">{open ? <X className="size-5" /> : <Menu className="size-5" />}</button></div>{open && <div className="border-t border-white/[0.06] bg-[#15151b] px-5 py-4 md:hidden"><nav className="flex flex-col gap-1" aria-label="Mobile navigation">{navigation.map(item => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm text-[#d5d1da] hover:bg-white/[0.06]">{item.label}</Link>)}{!isAuthenticated && <button onClick={startAccountCreation} className="mt-2 rounded-xl bg-[#f1ede7] px-3 py-3 text-sm font-semibold text-[#161419]">Create account</button>}</nav></div>}</header>;
}
