import { describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../shared/const";
import { learnerIdOf, makeSessionUser } from "./learner";

const { getSupabaseSessionUser } = vi.hoisted(() => ({ getSupabaseSessionUser: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabaseSessionUser }));

import { SDKServer } from "./_core/sdk";

describe("Supabase identity precedence", () => {
  it("uses a valid Supabase bearer token instead of a simultaneous legacy OAuth cookie", async () => {
    const supabaseUser = makeSessionUser({ learnerId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "Supabase learner", email: "learner@example.com", role: "user" });
    getSupabaseSessionUser.mockResolvedValue(supabaseUser);
    const sdk = new SDKServer({} as any);
    const verifySession = vi.fn();
    (sdk as any).verifySession = verifySession;
    const user = await sdk.authenticateRequest({ headers: { authorization: "Bearer supabase-access-token", cookie: `${COOKIE_NAME}=legacy-oauth-token` } } as any);
    expect(learnerIdOf(user)).toBe(learnerIdOf(supabaseUser));
    expect(getSupabaseSessionUser).toHaveBeenCalledWith("supabase-access-token");
    expect(verifySession).not.toHaveBeenCalled();
  });
});
