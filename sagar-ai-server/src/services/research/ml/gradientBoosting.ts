/**
 * A minimal, deterministic Gradient Boosting regressor built from the
 * hand-rolled CART trees in ./regressionTree. Standard least-squares
 * boosting: fit a shallow tree to the current residuals, shrink it by
 * the learning rate, repeat. No row/feature subsampling, so training
 * is fully deterministic - the same data always produces the same
 * model, with no seed needed for the model itself (a seed is only
 * used later, for permutation importance's column shuffling).
 *
 * This exists because the SST research page previously claimed to run
 * a "GradientBoostingRegressor (scikit-learn)" while actually
 * computing a hardcoded linear offset - a fabricated result the
 * hardening task explicitly forbids. This is a real, if simple,
 * implementation of the named algorithm.
 */

import { fitRegressionTree, predictTree, treePathContributions, type TreeNode } from "./regressionTree";
import { createSeededRng, mae, seededShuffle } from "./prng";

export interface GradientBoostingOptions {
  nEstimators: number;
  learningRate: number;
  maxDepth: number;
  minSamplesLeaf: number;
}

export interface GradientBoostingModel {
  initialValue: number;
  trees: TreeNode[];
  learningRate: number;
  /** Constant part of every prediction: initialValue plus each tree's
   * own root value (the mean residual it was fit on), scaled by the
   * learning rate. Does not depend on the input row - see
   * localContributions for why this is split out. */
  baseValue: number;
  featureNames: string[];
}

export function fitGradientBoosting(
  X: number[][],
  y: number[],
  featureNames: string[],
  options: GradientBoostingOptions
): GradientBoostingModel {
  const initialValue = y.reduce((s, v) => s + v, 0) / y.length;
  let residuals = y.map((v) => v - initialValue);

  const trees: TreeNode[] = [];

  for (let m = 0; m < options.nEstimators; m++) {
    const tree = fitRegressionTree(X, residuals, {
      maxDepth: options.maxDepth,
      minSamplesLeaf: options.minSamplesLeaf,
    });
    trees.push(tree);

    for (let i = 0; i < X.length; i++) {
      residuals[i] = residuals[i]! - options.learningRate * predictTree(tree, X[i]!);
    }
  }

  const baseValue =
    initialValue + options.learningRate * trees.reduce((sum, tree) => sum + tree.value, 0);

  return { initialValue, trees, learningRate: options.learningRate, baseValue, featureNames };
}

export function predictGradientBoosting(model: GradientBoostingModel, x: number[]): number {
  let prediction = model.initialValue;
  for (const tree of model.trees) {
    prediction += model.learningRate * predictTree(tree, x);
  }
  return prediction;
}

export function predictGradientBoostingBatch(model: GradientBoostingModel, X: number[][]): number[] {
  return X.map((x) => predictGradientBoosting(model, x));
}

export interface FeatureContribution {
  feature: string;
  contribution: number;
  rank: number;
}

/**
 * Exact local decomposition of a single prediction:
 * prediction(x) === model.baseValue + sum(contribution per feature).
 * Verified by a unit test rather than merely asserted here.
 */
export function localContributions(model: GradientBoostingModel, x: number[]): FeatureContribution[] {
  const totals = new Array(model.featureNames.length).fill(0) as number[];

  for (const tree of model.trees) {
    for (const step of treePathContributions(tree, x)) {
      totals[step.featureIndex] += model.learningRate * step.delta;
    }
  }

  return totals
    .map((contribution, index) => ({ feature: model.featureNames[index]!, contribution }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export interface PermutationImportanceEntry {
  feature: string;
  importance: number;
  rank: number;
}

/**
 * Global permutation importance on a held-out set: how much worse MAE
 * gets when one feature column is shuffled (breaking its relationship
 * with the target) while every other column is left alone. Used as
 * the stand-in for SHAP TreeExplainer, which needs a Python/sklearn
 * runtime this service does not have - documented here rather than
 * silently mislabeled as SHAP.
 */
export function permutationImportance(
  model: GradientBoostingModel,
  X: number[][],
  y: number[],
  options: { repeats: number; seed: number } = { repeats: 8, seed: 20260920 }
): PermutationImportanceEntry[] {
  const baselinePredictions = predictGradientBoostingBatch(model, X);
  const baselineMae = mae(baselinePredictions, y);
  const rng = createSeededRng(options.seed);

  const importances = model.featureNames.map((feature, featureIndex) => {
    let totalDegradation = 0;

    for (let r = 0; r < options.repeats; r++) {
      const columnValues = X.map((row) => row[featureIndex]!);
      const shuffled = seededShuffle(columnValues, rng);

      const permutedX = X.map((row, i) => {
        const clone = row.slice();
        clone[featureIndex] = shuffled[i]!;
        return clone;
      });

      const permutedPredictions = predictGradientBoostingBatch(model, permutedX);
      totalDegradation += mae(permutedPredictions, y) - baselineMae;
    }

    return { feature, importance: totalDegradation / options.repeats };
  });

  return importances
    .sort((a, b) => b.importance - a.importance)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
