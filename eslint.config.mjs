import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext build output for Cloudflare Workers.
    ".open-next/**",
    // Wrangler local state and bundles from `npm run preview`.
    ".wrangler/**",
    // Gitignored verification artifacts and agent worktree copies.
    "verify/**",
    ".claude/worktrees/**",
    // Third-party parser fetched at a pinned commit, and generated bundles, for the export eval.
    "evals/ats-export/vendor/**",
    "evals/ats-export/baseline-work/**",
    "evals/ats-export/parity-work/**",
  ]),
]);

export default eslintConfig;
