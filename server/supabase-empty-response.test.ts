import { afterEach, describe, expect, it, vi } from "vitest";
import { supabaseAdminRequest } from "./supabase";

describe("supabaseAdminRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts successful empty Supabase REST responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(supabaseAdminRequest<void>("/rest/v1/challenges")).resolves.toBeUndefined();
  });
});
