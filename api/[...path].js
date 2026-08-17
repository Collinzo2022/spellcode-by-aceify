import { createSpellCodeApp } from "../server/app.ts";

// Keep the Vercel entry JavaScript-only. Vercel's API bundler transpiles the
// TypeScript dependency graph with esbuild, avoiding a conflicting standalone
// type-analysis pass that previously omitted this catch-all function.
export default createSpellCodeApp();
