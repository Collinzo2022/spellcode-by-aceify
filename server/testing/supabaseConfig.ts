// Supabase's configuration is read from ENV on every call, and ENV is a plain
// object. Code that calls Supabase refuses to run until a project is
// configured, so a test that stubs fetch still needs one: supabaseOn assigns a
// made-up project on a reserved domain that never resolves, and restoreSupabase
// puts back what the file started with.
import { ENV } from "../_core/env";

type SupabaseProject = { url: string; anonKey: string; serviceRoleKey: string };

const original: SupabaseProject = { url: ENV.supabaseUrl, anonKey: ENV.supabaseAnonKey, serviceRoleKey: ENV.supabaseServiceRoleKey };

function configureSupabase(project: SupabaseProject): void {
  ENV.supabaseUrl = project.url;
  ENV.supabaseAnonKey = project.anonKey;
  ENV.supabaseServiceRoleKey = project.serviceRoleKey;
}

export const supabaseOn = (): void => configureSupabase({ url: "https://supabase.example.test", anonKey: "anon-key", serviceRoleKey: "service-role-key" });

export const restoreSupabase = (): void => configureSupabase(original);
