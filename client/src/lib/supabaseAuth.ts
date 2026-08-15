export type SupabasePublicConfig = { url: string; anonKey: string };
type SupabaseSession = { access_token: string; refresh_token: string; expires_at?: number; user: { id: string; email?: string } };

const STORAGE_KEY = "spellcode-supabase-session";

export function getSupabaseAccessToken() {
  try { return (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as SupabaseSession | null)?.access_token ?? null; } catch { return null; }
}

export function clearSupabaseSession() { try { localStorage.removeItem(STORAGE_KEY); } catch {} }

function persist(session: SupabaseSession) { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); }

async function callSupabase(config: SupabasePublicConfig, path: string, payload: Record<string, unknown>) {
  const response = await fetch(`${config.url}${path}`, { method: "POST", headers: { apikey: config.anonKey, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.json() as SupabaseSession & { error_description?: string; msg?: string };
  if (!response.ok) throw new Error(body.error_description ?? body.msg ?? "Unable to authenticate.");
  if (body.access_token) persist(body);
  return body;
}

export function signInWithPassword(config: SupabasePublicConfig, email: string, password: string) { return callSupabase(config, "/auth/v1/token?grant_type=password", { email, password }); }
export function signUpWithPassword(config: SupabasePublicConfig, email: string, password: string, displayName: string) { return callSupabase(config, "/auth/v1/signup", { email, password, data: { display_name: displayName } }); }
