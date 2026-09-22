import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseAdminRequest } from "./supabase";
import { restoreSupabase, supabaseOn } from "./testing/supabaseConfig";

describe("supabaseAdminRequest", () => {
  // It refuses to run until a Supabase project is configured; fetch is stubbed,
  // so a made-up one will do.
  beforeEach(supabaseOn);
  afterEach(() => {
    restoreSupabase();
    vi.unstubAllGlobals();
  });

  it("accepts successful empty Supabase REST responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(supabaseAdminRequest<void>("/rest/v1/challenges")).resolves.toBeUndefined();
  });
});
