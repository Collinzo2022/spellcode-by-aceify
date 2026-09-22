import { publicProcedure, router } from "../_core/trpc";
import { availability } from "../availability";

// Public: three booleans, nothing about any Learner. Pages read it so each
// capability's entry point can say it is unavailable before anyone clicks.
//
// Deliberately not called "features": ADR 0001 retired that word for a
// per-feature map that reads as a permission set. This reports whether a
// service can run, not what a Learner has paid for.
export const availabilityRouter = router({
  status: publicProcedure.query(() => availability()),
});
