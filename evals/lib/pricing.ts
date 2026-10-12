/** USD per million tokens. Cache write is 1.25x input, cache read 0.1x input. */
export interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const mk = (input: number, output: number): Price => ({ input, output, cacheWrite: input * 1.25, cacheRead: input * 0.1 });

/** Matched by substring of the model id, first hit wins. */
const TABLE: Array<[string, Price]> = [
  ['sonnet-4-6', mk(3, 15)],
  ['sonnet-5-5', mk(2, 10)],
  ['opus-5-5', mk(4, 20)],
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
