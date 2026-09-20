/**
 * Small deterministic helpers shared by the SST research model: a
 * seeded PRNG (so permutation importance is reproducible run-to-run)
 * and the plain regression metrics used to report real, computed
 * evaluation numbers - never a fabricated accuracy figure.
 */

/** mulberry32 - tiny, deterministic, seeded PRNG. Same seed always
 * produces the same shuffle sequence, so permutation importance is
 * reproducible rather than flapping between requests. */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], rng: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function mae(predicted: number[], actual: number[]): number {
  if (predicted.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < predicted.length; i++) total += Math.abs(predicted[i]! - actual[i]!);
  return total / predicted.length;
}

export function rmse(predicted: number[], actual: number[]): number {
  if (predicted.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < predicted.length; i++) total += (predicted[i]! - actual[i]!) ** 2;
  return Math.sqrt(total / predicted.length);
}

/** Standard r2_score definition: 1 - SS_res/SS_tot, using the mean of
 * the actual values passed in (each split's own mean, matching
 * sklearn's default behaviour - never a shared/global mean). */
export function r2Score(predicted: number[], actual: number[]): number {
  if (predicted.length < 2) return 0;
  const actualMean = mean(actual);
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < predicted.length; i++) {
    ssRes += (actual[i]! - predicted[i]!) ** 2;
    ssTot += (actual[i]! - actualMean) ** 2;
  }
  if (ssTot === 0) return 0;
  return 1 - ssRes / ssTot;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
