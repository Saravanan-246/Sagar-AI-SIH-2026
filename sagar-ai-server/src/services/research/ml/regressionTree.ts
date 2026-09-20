/**
 * A minimal, deterministic CART regression tree.
 *
 * Written by hand (no sklearn/Python available in this Node/TypeScript
 * service) so the SST research model is a real, inspectable algorithm
 * rather than a fabricated "GradientBoostingRegressor" label sitting on
 * top of a hardcoded formula. Greedy, exhaustive best-split search -
 * no randomness anywhere, so a tree trained on the same data always
 * comes out identical (a real reproducibility property, not a claimed
 * one).
 *
 * Every internal node also stores `value` (the mean training target
 * for the samples that reach it, i.e. what it would predict if it were
 * a leaf). That is what makes `treePathContributions` below possible:
 * it lets a prediction be decomposed, split by split, into how much
 * each feature moved the estimate away from its parent node's value
 * (the "Saabas" method - the direct precursor to SHAP for trees, and a
 * real, checkable decomposition rather than an invented coefficient).
 */

export interface TreeNode {
  value: number;
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

export interface TreeFitOptions {
  maxDepth: number;
  minSamplesLeaf: number;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

interface CandidateSplit {
  featureIndex: number;
  threshold: number;
  leftIndices: number[];
  rightIndices: number[];
  gain: number;
}

function findBestSplit(
  X: number[][],
  y: number[],
  indices: number[],
  nFeatures: number,
  minSamplesLeaf: number
): CandidateSplit | null {
  const targets = indices.map((i) => y[i]!);
  const parentSum = targets.reduce((s, v) => s + v, 0);
  const parentSse = targets.reduce((s, v) => s + (v - parentSum / targets.length) ** 2, 0);

  let best: CandidateSplit | null = null;

  for (let f = 0; f < nFeatures; f++) {
    const sorted = [...indices].sort((a, b) => X[a]![f]! - X[b]![f]!);
    const n = sorted.length;

    let sumLeft = 0;
    let sqLeft = 0;
    let sumRight = 0;
    let sqRight = 0;
    for (const i of sorted) {
      sumRight += y[i]!;
      sqRight += y[i]! * y[i]!;
    }

    for (let pos = 0; pos < n - 1; pos++) {
      const i = sorted[pos]!;
      const yi = y[i]!;
      sumLeft += yi;
      sqLeft += yi * yi;
      sumRight -= yi;
      sqRight -= yi * yi;

      const nLeft = pos + 1;
      const nRight = n - nLeft;
      if (nLeft < minSamplesLeaf || nRight < minSamplesLeaf) continue;

      const currentValue = X[sorted[pos]!]![f]!;
      const nextValue = X[sorted[pos + 1]!]![f]!;
      if (currentValue === nextValue) continue; // no real threshold between identical values

      const sseLeft = sqLeft - (sumLeft * sumLeft) / nLeft;
      const sseRight = sqRight - (sumRight * sumRight) / nRight;
      const gain = parentSse - (sseLeft + sseRight);

      if (!best || gain > best.gain) {
        best = {
          featureIndex: f,
          threshold: (currentValue + nextValue) / 2,
          leftIndices: sorted.slice(0, nLeft),
          rightIndices: sorted.slice(nLeft),
          gain,
        };
      }
    }
  }

  return best;
}

export function fitRegressionTree(X: number[][], y: number[], options: TreeFitOptions): TreeNode {
  const nFeatures = X[0]?.length ?? 0;

  function buildNode(indices: number[], depth: number): TreeNode {
    const nodeValue = mean(indices.map((i) => y[i]!));

    if (depth >= options.maxDepth || indices.length < 2 * options.minSamplesLeaf) {
      return { value: nodeValue };
    }

    const split = findBestSplit(X, y, indices, nFeatures, options.minSamplesLeaf);
    if (!split || split.gain <= 1e-9) {
      return { value: nodeValue };
    }

    return {
      value: nodeValue,
      featureIndex: split.featureIndex,
      threshold: split.threshold,
      left: buildNode(split.leftIndices, depth + 1),
      right: buildNode(split.rightIndices, depth + 1),
    };
  }

  const allIndices = y.map((_, i) => i);
  return buildNode(allIndices, 0);
}

export function predictTree(node: TreeNode, x: number[]): number {
  let current = node;
  while (current.left && current.right && current.featureIndex !== undefined) {
    current = x[current.featureIndex]! <= current.threshold! ? current.left : current.right;
  }
  return current.value;
}

/**
 * Saabas path decomposition for a single tree: walks the same route
 * `predictTree` would take and records, at each split, how much the
 * node value changed - attributed to the feature that split used. The
 * identity `root.value + sum(deltas) === predictTree(node, x)` holds
 * exactly (checked in tests), so this is a real decomposition of the
 * tree's own prediction, not an approximation invented for display.
 */
export function treePathContributions(node: TreeNode, x: number[]): { featureIndex: number; delta: number }[] {
  const contributions: { featureIndex: number; delta: number }[] = [];
  let current = node;

  while (current.left && current.right && current.featureIndex !== undefined) {
    const next = x[current.featureIndex]! <= current.threshold! ? current.left : current.right;
    contributions.push({ featureIndex: current.featureIndex, delta: next.value - current.value });
    current = next;
  }

  return contributions;
}
