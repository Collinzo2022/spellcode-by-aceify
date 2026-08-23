import { ENV } from "./_core/env";
import { makeSessionUser, type AppUser } from "./learner";

// The scaffold imports `AppUser` from this module, so the name stays exported
// here; it is declared at the boundary in ./learner.
export type { AppUser } from "./learner";

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: { display_name?: string; full_name?: string; name?: string };
};

type SupabaseProfile = {
  id: string;
  display_name?: string | null;
  role?: "learner" | "instructor" | "admin" | null;
  xp?: number | null;
  current_streak?: number | null;
};

function assertSupabaseConfig() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey || !ENV.supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured");
  }
}

export function getSupabasePublicConfig() {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) throw new Error("Supabase public configuration is unavailable");
  return { url: ENV.supabaseUrl, anonKey: ENV.supabaseAnonKey };
}

export async function getSupabaseSessionUser(accessToken: string): Promise<AppUser | null> {
  assertSupabaseConfig();
  const authResponse = await fetch(`${ENV.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: ENV.supabaseAnonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!authResponse.ok) return null;
  const authUser = (await authResponse.json()) as SupabaseAuthUser;

  const profileResponse = await fetch(`${ENV.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,display_name,role,xp,current_streak`, {
    headers: { apikey: ENV.supabaseServiceRoleKey, Authorization: `Bearer ${ENV.supabaseServiceRoleKey}` },
  });
  if (!profileResponse.ok) throw new Error("Unable to retrieve the Supabase learner profile");
  let [profile] = (await profileResponse.json()) as SupabaseProfile[];
  if (!profile) {
    const displayName = authUser.user_metadata?.display_name ?? authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? authUser.email ?? "Learner";
    const created = await supabaseAdminRequest<SupabaseProfile[]>("/rest/v1/profiles?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ id: authUser.id, display_name: displayName }) });
    profile = created[0];
  }
  const fallbackName = authUser.user_metadata?.display_name ?? authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? authUser.email ?? "Learner";

  return makeSessionUser({
    learnerId: authUser.id,
    name: profile?.display_name ?? fallbackName,
    email: authUser.email ?? null,
    role: profile?.role === "admin" ? "admin" : "user",
  });
}

export async function supabaseAdminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  assertSupabaseConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", ENV.supabaseServiceRoleKey);
  headers.set("Authorization", `Bearer ${ENV.supabaseServiceRoleKey}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${ENV.supabaseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${body.slice(0, 280)}`);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  return body ? JSON.parse(body) as T : undefined as T;
}
