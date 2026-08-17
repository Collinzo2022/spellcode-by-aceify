import { createSpellCodeApp } from "../server/app";

// Vercel invokes this exported Express application as a serverless function for
// every /api/* request. Do not call app.listen() from this module.
export default createSpellCodeApp();
