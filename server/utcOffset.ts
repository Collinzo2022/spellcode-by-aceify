import type { Express, NextFunction, Request, Response } from "express";
import { parseUtcOffsetMinutes, UTC_OFFSET_HEADER } from "../shared/utcOffset";

/**
 * Hold the client-facing API to the Local Day contract, before a request
 * reaches a route.
 *
 * Validating once at the edge refuses a malformed offset in one place rather
 * than at each request that completes a unit of learning or reads a Streak, and
 * it cannot be forgotten when the next such request is added. An absent offset
 * passes straight through as UTC.
 *
 * Mounted on the two surfaces our own clients call, not on all of `/api`: the
 * Paystack webhook is not party to this contract, and a stray header on an
 * incoming payment must never cost a Learner their entitlement.
 */
export function registerUtcOffsetContract(app: Express) {
  app.use(["/api/trpc", "/api/mobile"], (req: Request, res: Response, next: NextFunction) => {
    try {
      parseUtcOffsetMinutes(req.header(UTC_OFFSET_HEADER));
      return next();
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid UTC offset" });
    }
  });
}
