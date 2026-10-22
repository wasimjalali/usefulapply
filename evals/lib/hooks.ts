/**
 * Module redirects, installed before any production module is imported.
 *
 *  - '@/lib/models'            -> evals/lib/models-shim.ts (no ledger, no D1)
 *  - modules that need Workers bindings, PostHog or storage -> inert stubs. None of them is
 *    on a Claude task path: the language detector's Haiku call is bypassed because the
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

// ---------------------------------------------------------------------------
// Haiku 5.5 swap harness (evals/haiku-55-swap). Separate from installHooks() above, which the
// Sonnet harness uses and must keep behaving the same.
//
// What it redirects, and why:
//  - '@/lib/models/haiku' (and the same file reached through './haiku' or the models index): the real
//    module with callHaiku wrapped. While an eval scope has a backend (dry run, or the gpt-oss
//    baseline), the call goes to that backend instead of the network. Without one, the real
//    callHaiku runs and evals/haiku-55-swap/lib/wire.ts records and rewrites the HTTP request.
//  - '@/db/repos/adminMetrics': the LLM ledger. The harness never writes to a ledger.
//  - '@/lib/posthog-server': inert, as in installHooks().
//  - '@opennextjs/cloudflare': getCloudflareContext() returns globalThis.__evalCfEnv (the chat site sets
//    it to the local D1 from wrangler's platform proxy; everything else leaves it empty).
//  - anything a site registers with registerStub() (the tracker site stubs auth and the row source).
// ---------------------------------------------------------------------------

export type HaikuBackendHook = (kind: 'haiku' | 'workers-ai' | 'workers-ai-binding', options: unknown) => Promise<unknown> | null;

interface HaikuHookGlobals {
  __evalHaikuBackend?: HaikuBackendHook;
  /** True while measureHaikuRequest must count locally (a dry run has no network and no key). */
  __evalOfflineMeasure?: () => boolean;
  __evalCfEnv?: Record<string, unknown>;
  __evalStubs?: Record<string, unknown>;
}
const g = globalThis as unknown as HaikuHookGlobals;

/** Replace a module for the rest of the process. Call before the first import of anything that uses it. */
export function registerStub(request: string, exports: unknown): void {
  (g.__evalStubs ??= {})[request] = exports;
}

/**
 * The backend decides, per call, whether the call is handled in process. It returns a promise to
 * handle the call, or null to let the real code run.
 */
export function setHaikuBackend(hook: HaikuBackendHook | undefined): void {
  g.__evalHaikuBackend = hook;
}

/** Decides, per call, whether measureHaikuRequest counts with the local estimate instead of count_tokens. */
export function setOfflineMeasure(check: (() => boolean) | undefined): void {
  g.__evalOfflineMeasure = check;
}

export function setCloudflareEnv(env: Record<string, unknown> | undefined): void {
  g.__evalCfEnv = env;
}

const HAIKU_FILE = path.join(ROOT, 'src', 'lib', 'models', 'haiku.ts');

function wrapped<T extends Record<string, unknown>>(real: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(real)) Object.defineProperty(out, key, { enumerable: true, configurable: true, get: () => real[key] });
  for (const [key, value] of Object.entries(patch)) Object.defineProperty(out, key, { enumerable: true, configurable: true, value });
  return out as T;
}

const ledgerStub = {
  startLlmGeneration: async () => ({ id: `eval-${Math.random().toString(36).slice(2)}` }),
  completeLlmGeneration: async () => undefined,
  failLlmGeneration: async () => undefined,
  recordAuthMetricEvent: async () => undefined,
  hashMetricSubject: async (subject: string) => `eval-${subject}`,
};

export function installHaikuHooks(): void {
  const origLoad = Module._load;
  const cache = new Map<string, unknown>();
  Module._load = function (this: unknown, ...args: unknown[]) {
    const request = args[0] as string;
    const stubs = g.__evalStubs;
    if (stubs && request in stubs) return stubs[request];

    if (request === '@/db/repos/adminMetrics') {
      // Keep the real exports (types erase, but a few helpers are values) and swap the ledger writers.
      return wrapped(origLoad.apply(this, args) as Record<string, unknown>, ledgerStub);
    }
    if (request === '@/lib/posthog-server') {
      return { getPostHogServer: () => ({ captureException() {}, capture() {}, async flush() {} }) };
    }
    if (request === '@/lib/storage/applicantStore') return { loadApplicantDocuments: async () => ({}) };
    if (request === '@opennextjs/cloudflare') {
      return { getCloudflareContext: async () => ({ env: g.__evalCfEnv ?? {} }), initOpenNextCloudflareForDev: () => undefined };
    }

    let resolved: string | null = null;
    try {
      resolved = Module._resolveFilename(...args);
    } catch {
      resolved = null;
    }
    if (resolved === HAIKU_FILE) {
      if (!cache.has(resolved)) {
        const real = origLoad.apply(this, args) as Record<string, unknown>;
        const realCall = real.callHaiku as (options: unknown) => Promise<unknown>;
        const realMeasure = real.measureHaikuRequest as (options: unknown, deps?: unknown) => Promise<unknown>;
        cache.set(resolved, wrapped(real, {
          callHaiku: (options: unknown) => g.__evalHaikuBackend?.('haiku', options) ?? realCall(options),
          // Offline (dry): the same guard, with count_tokens answered by the local estimate.
          measureHaikuRequest: (options: unknown, deps?: unknown) =>
            g.__evalOfflineMeasure?.() ? realMeasure(options, offlineMeasureDeps()) : realMeasure(options, deps),
        }));
      }
      return cache.get(resolved);
    }
    return origLoad.apply(this, args);
  };
}

/** Deps for measureHaikuRequest with no network: count_tokens is the local estimate, nothing else may run. */
function offlineMeasureDeps(): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded lazily, after the hooks are installed
  const { estimateInputTokens } = require(path.join(ROOT, 'src', 'lib', 'models', 'token-budget.ts')) as {
    estimateInputTokens: (parts: { system: unknown; tools: unknown; messages: unknown }) => number;
  };
  const refuse = () => {
    throw new Error('offline measure: only count_tokens may run');
  };
  return {
    getClient: () => ({
      createMessage: refuse,
      countTokens: async (params: { system: unknown; tools?: unknown; messages: unknown }) =>
        estimateInputTokens({ system: params.system, tools: params.tools, messages: params.messages }),
    }),
    getBedrockClient: () => null,
    startLedger: refuse,
    completeLedger: refuse,
    failLedger: refuse,
    capture: async () => {},
  };
}

/** Calls the active eval backend directly. Used by the ranking site to stand in for the pre-swap `env.AI.run`. */
export function runBackend(kind: 'haiku' | 'workers-ai' | 'workers-ai-binding', options: unknown): Promise<unknown> {
  const handled = g.__evalHaikuBackend?.(kind, options);
  if (!handled) throw new Error('Workers AI binding unavailable outside an eval backend');
  return handled;
}
