import { BrandMark } from "@/components/spellcode/BrandMark";
import { ThemeToggle } from "@/components/spellcode/ThemeToggle";
import { SupabaseAuthError, signInWithPassword, signUpWithPassword } from "@/lib/supabaseAuth";
import { trpc } from "@/lib/trpc";
import { EMAIL_RATE_LIMIT_RETRY_MS, SIGNUP_CONFIRMATION_COOLDOWN_MS, getEmailRateLimitMessage, getSignupCooldownStorageKey, isEmailRateLimitError, isSignupCooldownActive } from "@shared/authRecovery";
import { getConfirmPasswordError } from "@shared/passwordValidation";
import { ArrowRight, Clock3, Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const inputClassName =
  "mt-2 w-full rounded-xl border border-white/[0.1] bg-black/20 px-3.5 py-3 text-sm outline-none ring-[#8a74d9] focus:ring-1";
function loadRetryAt(email: string) {
  if (!email.trim()) return 0;
  try {
    const value = Number(localStorage.getItem(getSignupCooldownStorageKey(email)));
    return isSignupCooldownActive(value) ? value : 0;
  } catch {
    return 0;
  }
}

function saveRetryAt(email: string, retryAt: number) {
  if (!email.trim()) return;
  try {
    localStorage.setItem(getSignupCooldownStorageKey(email), String(retryAt));
  } catch {}
}

function formatRemainingTime(milliseconds: number) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  return minutes >= 60 ? "about one hour" : `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export default function Auth() {
  const [mode, setMode] = useState<"signin" | "signup">(
    new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const config = trpc.auth.supabaseConfig.useQuery();
  const passwordMismatch = mode === "signup" && confirmPassword.length > 0 && password !== confirmPassword;
  const signUpBlocked = mode === "signup" && retryAt > now;

  useEffect(() => {
    if (!retryAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, [retryAt]);

  useEffect(() => {
    setRetryAt(loadRetryAt(email));
  }, [email]);

  useEffect(() => {
    if (retryAt && retryAt <= now) {
      try {
        localStorage.removeItem(getSignupCooldownStorageKey(email));
      } catch {}
      setRetryAt(0);
    }
  }, [email, now, retryAt]);

  const switchMode = () => {
    setMode(mode === "signup" ? "signin" : "signup");
    setConfirmPassword("");
    setShowConfirmPassword(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!config.data || signUpBlocked) return;

    if (mode === "signup") {
      const passwordError = getConfirmPasswordError(password, confirmPassword);
      if (passwordError) {
        toast.error(passwordError);
        return;
      }
    }

    setSaving(true);
    try {
      const response =
        mode === "signup"
          ? await signUpWithPassword(config.data, email, password, displayName)
          : await signInWithPassword(config.data, email, password);

      if (mode === "signup" && !response.access_token) {
        const nextRetryAt = Date.now() + SIGNUP_CONFIRMATION_COOLDOWN_MS;
        saveRetryAt(email, nextRetryAt);
        setRetryAt(nextRetryAt);
        setNow(Date.now());
        toast.success("Check your email to confirm your account, then log in.");
        setMode("signin");
      } else {
        toast.success("Welcome to SpellCode by Aceify.");
        window.location.href = "/today";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to continue.";
      const status = error instanceof SupabaseAuthError ? error.status : undefined;

      if (mode === "signup" && isEmailRateLimitError(status, message)) {
        const nextRetryAt = Date.now() + EMAIL_RATE_LIMIT_RETRY_MS;
        saveRetryAt(email, nextRetryAt);
        setRetryAt(nextRetryAt);
        setNow(Date.now());
        toast.error(getEmailRateLimitMessage());
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="auth-page relative grid min-h-screen place-items-center bg-[#111116] px-5 text-[#f8f5ef]">
      <div className="absolute right-5 top-5 sm:right-8 sm:top-7">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex">
          <BrandMark />
        </Link>

        <div className="mt-10 rounded-3xl border border-white/[0.09] bg-[#17171e] p-7 shadow-[0_25px_80px_rgba(0,0,0,.32)] sm:p-9">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#c8a46e]">Your daily learning space</p>
          <h1 className="mt-3 font-display text-4xl tracking-[-0.05em]">
            {mode === "signup" ? "Create your account." : "Welcome back."}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#aaa5af]">
            {mode === "signup"
              ? "Start with focused practice, save your streak, and unlock your path when you are ready."
              : "Log in to continue today’s focused coding practice."}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === "signup" && (
              <label className="block text-xs text-[#c8c2cd]">
                Name
                <input required autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={inputClassName} />
              </label>
            )}

            <label className="block text-xs text-[#c8c2cd]">
              Email
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClassName} />
            </label>

            <label className="block text-xs text-[#c8c2cd]">
              Password
              <span className="relative mt-2 block">
                <input required minLength={6} type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClassName} mt-0 pr-12`} />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} title={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-[#aaa5af] transition-colors hover:text-[#f8f5ef] focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[#8a74d9]">
                  {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              </span>
            </label>

            {mode === "signup" && (
              <label className="block text-xs text-[#c8c2cd]">
                Confirm password
                <span className="relative mt-2 block">
                  <input required minLength={6} type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-invalid={passwordMismatch} aria-describedby={passwordMismatch ? "confirm-password-error" : undefined} className={`${inputClassName} mt-0 pr-12 ${passwordMismatch ? "border-[#e87b91] ring-[#e87b91]" : ""}`} />
                  <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"} aria-pressed={showConfirmPassword} title={showConfirmPassword ? "Hide confirm password" : "Show confirm password"} className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-[#aaa5af] transition-colors hover:text-[#f8f5ef] focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[#8a74d9]">
                    {showConfirmPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                  </button>
                </span>
                {passwordMismatch && <span id="confirm-password-error" className="mt-2 block text-xs text-[#f1a4b4]">Passwords do not match.</span>}
              </label>
            )}

            {signUpBlocked && (
              <div role="status" className="rounded-2xl border border-[#d7b77f]/30 bg-[#d7b77f]/[0.08] p-4 text-sm leading-6 text-[#ead7ac]">
                <span className="flex items-center gap-2 font-semibold"><Clock3 className="size-4" /> Confirmation email pause</span>
                <p className="mt-1">A confirmation email was recently requested for this address. Check your inbox, or wait {formatRemainingTime(retryAt - now)} before trying again.</p>
              </div>
            )}

            <button disabled={saving || config.isLoading || signUpBlocked} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#eee8df] px-5 py-3 text-sm font-semibold text-[#19171b] disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <>{mode === "signup" ? "Create account" : "Log in"}<ArrowRight className="size-4" /></>}
            </button>
          </form>

          <button onClick={switchMode} className="mt-6 text-sm text-[#cdbdf4] hover:text-[#ded2ff]">
            {mode === "signup" ? "Already have an account? Log in" : "New to SpellCode? Create an account"}
          </button>
        </div>
      </div>
    </main>
  );
}
