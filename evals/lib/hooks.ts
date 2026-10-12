/**
 * Module redirects, installed before any production module is imported.
 *
 *  - '@/lib/models'            -> evals/lib/models-shim.ts (no ledger, no D1)
 *  - modules that need Workers bindings, PostHog or storage -> inert stubs. None of them is
 *    on a Claude task path: the language detector's Workers AI call is bypassed because the
 *    harness sets context.detectedLanguage from the case itself.
 *  - prompt variants: when an arm names a variant other than 'production', a file in
 *    evals/prompt-variants/<variant>/ with the same base name as a production prompt module
 *    replaces it. Files without a counterpart keep the production version.
 */
import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('node:module') as { _load: (...args: unknown[]) => unknown; _resolveFilename: (...args: unknown[]) => string };

const ROOT = path.resolve(__dirname, '..', '..');
const PROMPTS_DIR = path.join(ROOT, 'src', 'lib', 'agents', 'prompts');
const VARIANTS_DIR = path.join(ROOT, 'evals', 'prompt-variants');

const STUBS: Record<string, unknown> = {
  '@/lib/models/workers-ai': { callWorkersAI: async () => { throw new Error('Workers AI is not available in the eval'); } },
  '@/lib/posthog-server': { getPostHogServer: () => ({ captureException() {}, capture() {}, async flush() {} }) },
  '@/lib/storage/applicantStore': { loadApplicantDocuments: async () => ({}) },
};

export const loadedPromptFiles: string[] = [];

export function installHooks(promptVariant: string, shim: unknown): void {
  const origLoad = Module._load;
  Module._load = function (this: unknown, ...args: unknown[]) {
    const request = args[0] as string;
    if (request === '@/lib/models' || request === '@/lib/models/index') {
      return shim;
    }
    if (request in STUBS) return STUBS[request];

    if (promptVariant !== 'production') {
      let resolved: string | null = null;
      try {
        resolved = Module._resolveFilename(...args);
      } catch {
        resolved = null;
      }
      if (resolved && path.dirname(resolved) === PROMPTS_DIR) {
        const override = path.join(VARIANTS_DIR, promptVariant, path.basename(resolved));
        if (fs.existsSync(override)) {
          loadedPromptFiles.push(override);
          return origLoad.call(this, override, ...args.slice(1));
        }
      }
    }
    return origLoad.apply(this, args);
  };
}
