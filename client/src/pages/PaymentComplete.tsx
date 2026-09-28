import { AppFooter } from "@/components/spellcode/AppFooter";
import { AppHeader } from "@/components/spellcode/AppHeader";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";

export default function PaymentComplete() {
  const reference = new URLSearchParams(window.location.search).get("reference") ?? "";
  const [started, setStarted] = useState(false);
  const verify = trpc.billing.verifyCheckout.useMutation();
  useEffect(() => { if (reference && !started) { setStarted(true); verify.mutate({ reference }); } }, [reference, started, verify]);
  const verified = verify.data?.verified;
  // The server distinguishes "not verified yet" from "this payment was reversed, so it does not
  // grant access", and both used to render as the same reassurance to wait. A Learner whose money
  // was unwound would keep refreshing a page telling them it was still processing.
  const failureMessage = verify.error?.message ?? "Your payment may still be processing. Please return to this page in a moment; access is granted only after secure server verification.";
  return <div className="min-h-screen bg-[#111116] text-[#f8f5ef]"><AppHeader /><main className="grid min-h-[70vh] place-items-center px-5"><div className="max-w-md text-center">{verified ? <><CheckCircle2 className="mx-auto size-12 text-[#91d8a5]" /><p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">Payment verified</p><h1 className="mt-3 font-display text-4xl tracking-[-0.05em]">Full Access is ready.</h1><p className="mt-4 text-sm leading-7 text-[#aaa5af]">Your learning path now includes advanced lessons, project publishing, certificates, and unlimited AI tutor support.</p><Link href="/today" className="mt-7 inline-flex rounded-full bg-[#eee8df] px-5 py-3 text-sm font-semibold text-[#19171b]">Open today’s task</Link></> : verify.isError ? <><h1 className="font-display text-4xl tracking-[-0.05em]">We are confirming your payment.</h1><p className="mt-4 text-sm leading-7 text-[#aaa5af]">{failureMessage}</p><Link href="/access" className="mt-7 inline-flex rounded-full border border-white/[0.12] px-5 py-3 text-sm font-semibold">Back to access options</Link></> : <><Loader2 className="mx-auto size-8 animate-spin text-[#c8b8f0]" /><h1 className="mt-6 font-display text-4xl tracking-[-0.05em]">Confirming your payment.</h1><p className="mt-4 text-sm leading-7 text-[#aaa5af]">Please keep this page open while we verify the transaction securely.</p></>}</div></main><AppFooter /></div>;
}
