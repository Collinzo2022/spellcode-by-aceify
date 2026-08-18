export function getConfirmPasswordError(password: string, confirmPassword: string): string | null {
  return password === confirmPassword ? null : "Passwords do not match.";
}
