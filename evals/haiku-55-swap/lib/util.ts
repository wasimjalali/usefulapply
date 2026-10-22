import type { LlmGenerationContext } from '@/db/repos/adminMetrics';

export function generationContext(feature: string, operation: string, userId = 'eval-user'): LlmGenerationContext {
  return { requestExecutionId: crypto.randomUUID(), userId, route: 'evals/haiku-55-swap', feature, operation };
}

/** Em dash, en dash, horizontal bar, figure dash. The product bans all of them in user-facing text. */
export const DASH_RE = /[—–―‒]/;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Deterministic PRNG so fixtures never change between runs (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)];
}

export function shuffle<T>(r: () => number, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Freezes `new Date()` and `Date.now()` for the duration of fn. Sites that build "TODAY" prompts use it. Not for concurrent use. */
export async function withFixedClock<T>(iso: string, fn: () => Promise<T>): Promise<T> {
  const Real = Date;
  const fixed = Real.parse(iso);
  class Frozen extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(fixed);
      else super(...(args as [number]));
    }
    static now(): number {
      return fixed;
    }
  }
  globalThis.Date = Frozen as unknown as DateConstructor;
  try {
    return await fn();
  } finally {
    globalThis.Date = Real;
  }
}

export function sentenceCount(text: string): number {
  return text.trim().split(/(?<=[.!?])\s+/).filter(Boolean).length;
}
