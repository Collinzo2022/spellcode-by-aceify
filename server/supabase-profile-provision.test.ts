import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseSessionUser } from "./supabase";
import { learnerIdOf } from "./learner";
import { restoreSupabase, supabaseOn } from "./testing/supabaseConfig";

describe("Supabase learner profile provisioning", () => {
  // It refuses to run until a Supabase project is configured; fetch is stubbed,
  // so a made-up one will do.
  beforeEach(supabaseOn);
  afterEach(() => {
    restoreSupabase();
    vi.unstubAllGlobals();
  });

  it("creates a Supabase learner profile when an authenticated user has no profile row", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "user-uuid", email: "learner@example.com", user_metadata: { display_name: "Ace Learner" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "user-uuid", display_name: "Ace Learner", role: "learner" }]), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const user = await getSupabaseSessionUser("valid-access-token");

    expect(user).toMatchObject({ id: "user-uuid", name: "Ace Learner", loginMethod: "supabase", role: "user" });
    expect(learnerIdOf(user!)).toBe("user-uuid");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/rest/v1/profiles?on_conflict=id");
  });
});
