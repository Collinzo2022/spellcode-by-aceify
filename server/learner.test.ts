import { describe, expect, it } from "vitest";
import { learnerIdOf, makeSessionUser } from "./learner";

describe("the learner boundary", () => {
  it("reads back the Learner ID a session was built from", () => {
    const session = makeSessionUser({ learnerId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "Ace Learner", email: "learner@example.com", role: "user" });

    expect(learnerIdOf(session)).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });

  it("identifies a session by its Learner ID alone", () => {
    const at = new Date("2026-08-23T10:00:00.000Z");
    const session = makeSessionUser({ learnerId: "learner-1", name: "Ace Learner", email: null, role: "admin", at });

    expect(session).toMatchObject({ id: "learner-1", name: "Ace Learner", email: null, role: "admin", loginMethod: "supabase", createdAt: at, lastSignedIn: at });
  });

  it("keeps the retired identifier name confined to this boundary", () => {
    // CONTEXT.md: a Learner ID is "never called `openId`". The scaffold in
    // server/_core still expects that field, so it survives here and nowhere
    // else. If this ever stops holding, the scaffold contract has changed and
    // the boundary should go with it.
    const session = makeSessionUser({ learnerId: "learner-1", name: "Ace Learner", email: null, role: "user" });

    expect(session.openId).toBe(learnerIdOf(session));
  });
});
