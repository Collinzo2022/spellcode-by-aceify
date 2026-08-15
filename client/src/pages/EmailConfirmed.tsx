import { CheckCircle2, LogIn } from "lucide-react";
import { Link } from "wouter";

export default function EmailConfirmed() {
  return <main className="grid min-h-screen place-items-center bg-[#111116] px-5 text-[#f8f5ef]"><section className="w-full max-w-md rounded-3xl border border-white/[0.09] bg-[#17171e] p-8 text-center shadow-[0_25px_80px_rgba(0,0,0,.32)]"><div className="mx-auto grid size-14 place-items-center rounded-full bg-[#cdbdf4]/15 text-[#d8caff]"><CheckCircle2 className="size-7" /></div><p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">SpellCode by Aceify</p><h1 className="mt-3 font-display text-4xl tracking-[-0.05em]">Email confirmed.</h1><p className="mt-4 text-sm leading-6 text-[#aaa5af]">Your account is ready. Return to SpellCode by Aceify and log in to begin your daily learning path.</p><Link href="/auth" className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#eee8df] px-5 py-3 text-sm font-semibold text-[#19171b]"><LogIn className="size-4" />Log in</Link></section></main>;
}
