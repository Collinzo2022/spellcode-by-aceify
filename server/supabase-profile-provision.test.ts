import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseSessionUser } from "./supabase";

describe("Supabase learner profile provisioning", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates a Supabase learner profile when an authenticated user has no profile row", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "user-uuid", email: "learner@example.com", user_metadata: { display_name: "Ace Learner" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "user-uuid", display_name: "Ace Learner", role: "learner" }]), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const user = await getSupabaseSessionUser("valid-access-token");

    expect(user).toMatchObject({ id: "user-uuid", openId: "user-uuid", name: "Ace Learner", loginMethod: "supabase", role: "user" });
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/rest/v1/profiles?on_conflict=id");
  });
});
