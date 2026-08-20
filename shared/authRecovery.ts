export const EMAIL_RATE_LIMIT_RETRY_MS = 60 * 60 * 1000;
export const SIGNUP_CONFIRMATION_COOLDOWN_MS = 60 * 1000;

export function getSignupCooldownStorageKey(email: string) {
  return `spellcode-signup-email-retry-at:${email.trim().toLowerCase()}`;
}

export function isSignupCooldownActive(retryAt: number, now = Date.now()) {
  return Number.isFinite(retryAt) && retryAt > now;
}

export function isEmailRateLimitError(status: number | undefined, message: string) {
  return status === 429 || /email.*rate.*(limit|exceed)|rate.*(limit|exceed).*email/i.test(message);
}

export function getEmailRateLimitMessage() {
  return "Email confirmations are temporarily limited. Please wait up to one hour, then try once more.";
}
