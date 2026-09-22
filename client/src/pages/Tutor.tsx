import { useAuth } from "@/_core/hooks/useAuth";
import { AIChatBox } from "@/components/AIChatBox";
import { AppFooter } from "@/components/spellcode/AppFooter";
import { AppHeader } from "@/components/spellcode/AppHeader";
import { startLogin } from "@/const";
import { useCapability } from "@/hooks/useCapability";
import { trpc } from "@/lib/trpc";
import { UNAVAILABLE_MESSAGE } from "@shared/availability";
import { LockKeyhole, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type TutorMessage = { role: "user" | "assistant"; content: string };

export default function Tutor() {
  const { isAuthenticated } = useAuth();
  const access = trpc.billing.myAccess.useQuery(undefined, { enabled: isAuthenticated });
  // Checked before Full Access, like the server: nobody is sold a tutor that is off.
  const tutor = useCapability("tutor");
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const ask = trpc.tutor.ask.useMutation({ onSuccess: response => setMessages(current => [...current, { role: "assistant", content: response.content }]), onError: error => { setMessages(current => current.slice(0, -1)); toast.error(error.message); } });
  const send = (content: string) => { if (!isAuthenticated) { toast.message("Sign in to use the tutor."); startLogin(); return; } if (!access.data?.hasFullAccess) return; const next = [...messages, { role: "user" as const, content }]; setMessages(next); ask.mutate({ messages: next.slice(-12) }); };
  const locked = !isAuthenticated || (!access.isLoading && !access.data?.hasFullAccess);
  return <div className="min-h-screen bg-[#111116] text-[#f8f5ef]"><AppHeader /><main className="mx-auto max-w-[1100px] px-5 py-12 lg:px-9"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#c8a46e]">Full Access · AI tutor</p><h1 className="mt-3 max-w-3xl font-display text-5xl tracking-[-0.06em]">Ask better questions. Build clearer understanding.</h1><p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#aaa5af]">Use the tutor to understand a concept, debug your thinking, or plan your next small step. It is designed for HTML, CSS, and JavaScript learning.</p>{tutor === "pending" ? null : tutor === "unavailable" ? <section className="mt-10 rounded-3xl border border-white/[0.1] bg-white/[0.03] p-7 text-center"><Sparkles className="mx-auto size-7 text-[#cbb8f4]" /><h2 className="mt-4 font-display text-3xl">{UNAVAILABLE_MESSAGE.tutor}</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#aaa5af]">It is moving to a new service. Everything else in SpellCode works as normal.</p></section> : locked ? <section className="mt-10 rounded-3xl border border-[#d7b77f]/25 bg-[#d7b77f]/[0.07] p-7 text-center"><LockKeyhole className="mx-auto size-7 text-[#e7cb95]" /><h2 className="mt-4 font-display text-3xl">Unlimited AI tutor is part of Full Access.</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#c0b4a1]">Unlock lessons past Level 1, project publishing, certificates, and guided AI tutor support in one plan.</p><Link href="/access" className="mt-6 inline-flex rounded-full bg-[#eee8df] px-5 py-3 text-sm font-semibold text-[#19171b]">View Full Access options</Link></section> : <section className="mt-10"><AIChatBox messages={messages} onSendMessage={send} isLoading={ask.isPending} className="border-white/[0.1] bg-[#17171e] text-[#f8f5ef]" height="560px" placeholder="Ask about HTML, CSS, or JavaScript…" emptyStateMessage="What would you like to understand better?" suggestedPrompts={["Explain semantic HTML with a small example.", "Why is CSS specificity affecting my style?", "Help me reason through a JavaScript event listener."]} /></section>}<div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-xs leading-5 text-[#918b96]"><Sparkles className="mt-0.5 size-4 shrink-0 text-[#cbb8f4]" />The tutor provides learning guidance. Review and understand all code before using it in a project.</div></main><AppFooter /></div>;
}
