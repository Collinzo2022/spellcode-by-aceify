import { learnerIdOf } from "../learner";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { protectedProcedure, router } from "../_core/trpc";
import { getVerifiedEntitlements } from "../supabaseLearning";

const tutorMessage = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(6_000) });

export const tutorRouter = router({
  ask: protectedProcedure.input(z.object({ messages: z.array(tutorMessage).min(1).max(12) })).mutation(async ({ ctx, input }) => {
    const access = await getVerifiedEntitlements(learnerIdOf(ctx.user));
    if (!access.hasFullAccess) throw new Error("The AI tutor is available with Full Access.");
    const response = await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You are the SpellCode by Aceify coding tutor. Help learners understand HTML, CSS, and JavaScript through concise explanations, small examples, and questions that encourage their own reasoning. Do not claim to execute code, deploy projects, or issue certificates. Do not give unsafe code or encourage copying without understanding." },
        ...input.messages,
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") throw new Error("The tutor could not prepare a response. Please try again.");
    return { content };
  }),
});
