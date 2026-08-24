import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./_core/storageProxy";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerPaystackWebhook } from "./paystack";
import { registerMobileRoutes } from "./mobile";
import { registerUtcOffsetContract } from "./utcOffset";

/** Shared HTTP application for the local long-running server and Vercel Functions. */
export function createSpellCodeApp() {
  const app = express();
  app.use(express.json({ limit: "50mb", verify: (req, _res, buffer) => { (req as express.Request & { rawBody?: Buffer }).rawBody = buffer; } }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerUtcOffsetContract(app);
  registerStorageProxy(app);
  registerPaystackWebhook(app);
  registerMobileRoutes(app);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app;
}
