/**
 * USD per million tokens. Cache write (5 min) is 1.25x input. Cache read is 0.1x input on Sonnet 4.6
 * and 0.05x on Sonnet 5.5 and Opus 5.5 (platform.claude.com model pages, checked 2026-10-12).
 * The 2026-10-12 eval run used 0.1x for every model; see its write-up for the correction.
 */
export interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const mk = (input: number, output: number, cacheReadRatio = 0.1): Price => ({ input, output, cacheWrite: input * 1.25, cacheRead: input * cacheReadRatio });

/** Matched by substring of the model id, first hit wins. */
const TABLE: Array<[string, Price]> = [
  ['sonnet-4-6', mk(3, 15)],
  ['sonnet-5-5', mk(2, 10, 0.05)],
  ['opus-5-5', mk(4, 20, 0.05)],
];

export function priceFor(modelId: string): Price {
  const hit = TABLE.find(([k]) => modelId.includes(k));
  if (!hit) throw new Error(`No price for model ${modelId}`);
  return hit[1];
}

export function costUsd(modelId: string, u: { input: number; output: number; cacheWrite: number; cacheRead: number }): number {
  const p = priceFor(modelId);
  return (u.input * p.input + u.output * p.output + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead) / 1e6;
}
