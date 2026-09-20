/**
 * SST Intelligence Lab - research service.
 *
 * Answers, honestly and only from real data:
 *   1. What is SST at this location right now?
 *   2. What environmental factors are actually available?
 *   3. Can those factors predict SST a few hours ahead?
 *   4. Which features actually drove that specific prediction?
 *   5. What sources/timestamps support the result?
 *
 * DATA (see sstDataSources.ts for the verification notes):
 *  - Open-Meteo Historical Weather API (ERA5/ERA5-Land reanalysis blend)
 *  - Open-Meteo Marine API (wave/ocean model blend - not observation)
 *  - Training window: trailing 365 days per requested location, ending
 *    CUTOFF_BUFFER_DAYS before "now" (the most recent day or two of
 *    Open-Meteo's marine/weather series is a near-real-time model
 *    analysis rather than a settled value, so it is excluded from the
 *    label the model is trained to predict).
 *
 * MODEL:
 *  - Hand-implemented Gradient Boosting Regressor (CART trees, see
 *    ./ml). There is no scikit-learn/Python runtime in this Node
 *    service, so this is a real (if simple) from-scratch algorithm
 *    rather than a fabricated "sklearn" label over a hardcoded formula
 *    - which is what this file replaced.
 *  - Time-aware 70/15/15 train/validation/test split - contiguous by
 *    time, never shuffled, so validation/test are strictly later in
 *    time than training (no leakage).
 *  - Compared against a persistence baseline (SST(t+horizon) = SST(t)).
 *    A model is only reported as validated when it beats that baseline
 *    on the held-out test set.
 *
 * EXPLANATION:
 *  - Local, per-prediction contributions via the Saabas method (exact
 *    decomposition of the tree ensemble's own prediction - see
 *    ml/gradientBoosting.ts). SHAP TreeExplainer would need a
 *    Python/sklearn runtime this service doesn't have, so it is not
 *    used and not claimed.
 *  - Global permutation importance is also reported as a
 *    cross-check.
 *  - Both are explicitly labeled "model feature contribution", never
 *    causal.
 */

import {
  fetchHistoricalRange,
  fetchRecentHourly,
  SOURCE_METADATA,
  type HourlyRow,
} from "./sstDataSources";
import {
  buildTrainingDataset,
  buildLiveFeatureVector,
  FEATURE_NAMES,
  FEATURE_LABELS,
  FEATURE_UNITS,
  type FeatureName,
} from "./sstFeatures";
import {
  fitGradientBoosting,
  predictGradientBoosting,
  localContributions,
  permutationImportance,
  type GradientBoostingModel,
} from "./ml/gradientBoosting";
import { mae, rmse, r2Score, standardDeviation } from "./ml/prng";

const HORIZON_HOURS = 6;
const TRAINING_WINDOW_DAYS = 365;
const CUTOFF_BUFFER_DAYS = 2;
const MIN_TRAINABLE_ROWS = 500;
const MODEL_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h - real training data doesn't change meaningfully faster than this

const GB_OPTIONS = { nEstimators: 80, learningRate: 0.08, maxDepth: 4, minSamplesLeaf: 20 };

interface Metrics {
  mae: number;
  rmse: number;
  r2: number;
}

interface TrainedModelInfo {
  algorithm: string;
  trainedAt: string;
  latitude: number;
  longitude: number;
  horizonHours: number;
  featureNames: readonly string[];
  dataWindow: { start: string; end: string };
  trainingPeriod: { start: string; end: string; rows: number };
  validationPeriod: { start: string; end: string; rows: number };
  testPeriod: { start: string; end: string; rows: number };
  metrics: { train: Metrics; validation: Metrics; test: Metrics };
  baseline: { description: string; test: Metrics };
  validated: boolean;
  validationLabel: "MODEL VALIDATED" | "MODEL NOT VALIDATED";
  validationReason: string;
  permutationImportance: { feature: string; label: string; importance: number; rank: number }[];
  validationResidualStdDev: number;
  diagnostics: {
    totalHourlyRowsFetched: number;
    droppedMissingTarget: number;
    droppedMissingFeature: number;
    usableRows: number;
  };
}

interface CachedModel {
  model: GradientBoostingModel;
  info: TrainedModelInfo;
  expiresAt: number;
}

const modelCache = new Map<string, CachedModel>();

function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function evaluate(predictions: number[], actuals: number[]): Metrics {
  return {
    mae: Math.round(mae(predictions, actuals) * 1000) / 1000,
    rmse: Math.round(rmse(predictions, actuals) * 1000) / 1000,
    r2: Math.round(r2Score(predictions, actuals) * 1000) / 1000,
  };
}

export interface DataReadinessResult {
  status: "insufficient";
  latitude: number;
  longitude: number;
  historicalWindow: { start: string; end: string };
  totalHourlyRowsFetched: number;
  usableRows: number;
  minimumRequiredRows: number;
  reason: string;
}

async function trainForLocation(
  latitude: number,
  longitude: number
): Promise<{ model: GradientBoostingModel; info: TrainedModelInfo } | DataReadinessResult> {
  const now = new Date();
  const endDate = new Date(now.getTime() - CUTOFF_BUFFER_DAYS * 24 * 60 * 60 * 1000);
  const startDate = new Date(endDate.getTime() - TRAINING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const historicalWindow = { start: toIsoDate(startDate), end: toIsoDate(endDate) };

  const rows: HourlyRow[] = await fetchHistoricalRange(
    latitude,
    longitude,
    historicalWindow.start,
    historicalWindow.end
  );

  const { dataset, diagnostics } = buildTrainingDataset(rows, HORIZON_HOURS);

  if (dataset.length < MIN_TRAINABLE_ROWS) {
    return {
      status: "insufficient",
      latitude,
      longitude,
      historicalWindow,
      totalHourlyRowsFetched: diagnostics.totalHourlyRowsFetched,
      usableRows: dataset.length,
      minimumRequiredRows: MIN_TRAINABLE_ROWS,
      reason:
        dataset.length === 0
          ? "Training dataset insufficient: no complete (weather + marine, no missing fields) hourly rows were available for this location and window."
          : `Training dataset insufficient: only ${dataset.length} complete hourly rows available (minimum ${MIN_TRAINABLE_ROWS} required for a time-aware train/validation/test split).`,
    };
  }

  const n = dataset.length;
  const nTrain = Math.floor(n * 0.7);
  const nVal = Math.floor(n * 0.15);

  const trainSet = dataset.slice(0, nTrain);
  const valSet = dataset.slice(nTrain, nTrain + nVal);
  const testSet = dataset.slice(nTrain + nVal);

  const trainX = trainSet.map((d) => d.x);
  const trainY = trainSet.map((d) => d.y);

  const model = fitGradientBoosting(trainX, trainY, FEATURE_NAMES as unknown as string[], GB_OPTIONS);

  const trainPred = trainSet.map((d) => predictGradientBoosting(model, d.x));
  const valPred = valSet.map((d) => predictGradientBoosting(model, d.x));
  const testPred = testSet.map((d) => predictGradientBoosting(model, d.x));

  const trainMetrics = evaluate(trainPred, trainSet.map((d) => d.y));
  const valMetrics = evaluate(valPred, valSet.map((d) => d.y));
  const testMetrics = evaluate(testPred, testSet.map((d) => d.y));

  // Persistence baseline: SST(t+horizon) predicted as SST(t) - the
  // simplest honest comparison for a short-horizon marine variable.
  const baselineTestPred = testSet.map((d) => d.currentSst);
  const baselineTestMetrics = evaluate(baselineTestPred, testSet.map((d) => d.y));

  const validated = testMetrics.mae < baselineTestMetrics.mae && testMetrics.r2 > 0;

  const valResiduals = valSet.map((d, i) => d.y - valPred[i]!);
  const validationResidualStdDev = Math.round(standardDeviation(valResiduals) * 1000) / 1000;

  const importance = permutationImportance(model, valSet.map((d) => d.x), valSet.map((d) => d.y));

  const info: TrainedModelInfo = {
    algorithm:
      "Gradient Boosting Regressor (hand-implemented CART ensemble, TypeScript) - scikit-learn is not available in this Node service",
    trainedAt: now.toISOString(),
    latitude,
    longitude,
    horizonHours: HORIZON_HOURS,
    featureNames: FEATURE_NAMES,
    dataWindow: historicalWindow,
    trainingPeriod: { start: trainSet[0]!.timestamp, end: trainSet[trainSet.length - 1]!.timestamp, rows: trainSet.length },
    validationPeriod: { start: valSet[0]!.timestamp, end: valSet[valSet.length - 1]!.timestamp, rows: valSet.length },
    testPeriod: { start: testSet[0]!.timestamp, end: testSet[testSet.length - 1]!.timestamp, rows: testSet.length },
    metrics: { train: trainMetrics, validation: valMetrics, test: testMetrics },
    baseline: {
      description: `Persistence baseline: predicts SST(t+${HORIZON_HOURS}h) = SST(t)`,
      test: baselineTestMetrics,
    },
    validated,
    validationLabel: validated ? "MODEL VALIDATED" : "MODEL NOT VALIDATED",
    validationReason: validated
      ? `Test MAE (${testMetrics.mae}°C) is lower than the persistence baseline's test MAE (${baselineTestMetrics.mae}°C) and test R² (${testMetrics.r2}) is positive.`
      : `Test MAE (${testMetrics.mae}°C) does not beat the persistence baseline's test MAE (${baselineTestMetrics.mae}°C), or test R² is not positive - the model is not shown as production-useful.`,
    permutationImportance: importance.map((entry) => ({
      feature: entry.feature,
      label: FEATURE_LABELS[entry.feature as FeatureName] ?? entry.feature,
      importance: Math.round(entry.importance * 1000) / 1000,
      rank: entry.rank,
    })),
    validationResidualStdDev,
    diagnostics,
  };

  return { model, info };
}

async function getOrTrainModel(
  latitude: number,
  longitude: number
): Promise<{ model: GradientBoostingModel; info: TrainedModelInfo } | DataReadinessResult> {
  const key = cacheKey(latitude, longitude);
  const cached = modelCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { model: cached.model, info: cached.info };
  }

  const result = await trainForLocation(latitude, longitude);
  if ("status" in result) {
    return result;
  }

  modelCache.set(key, { model: result.model, info: result.info, expiresAt: Date.now() + MODEL_CACHE_TTL_MS });
  return result;
}

export interface DisplayContribution {
  feature: string;
  value: number;
  unit: string;
  contribution: number;
  direction: "positive" | "negative" | "neutral";
  rank: number;
}

const DIRECTION_GROUPS: Array<{ label: string; sinIndex: FeatureName; cosIndex: FeatureName; rawValueDeg: (row: HourlyRow) => number | null }> = [
  {
    label: "Wind Direction",
    sinIndex: "wind_direction_sin",
    cosIndex: "wind_direction_cos",
    rawValueDeg: (row) => row.windDirection,
  },
  {
    label: "Ocean Current Direction",
    sinIndex: "current_direction_sin",
    cosIndex: "current_direction_cos",
    rawValueDeg: (row) => row.currentDirection,
  },
];

const SIMPLE_FEATURES: Array<{ feature: FeatureName; rawValue: (row: HourlyRow) => number | null }> = [
  { feature: "air_temperature_c", rawValue: (row) => row.airTemp },
  { feature: "wind_speed_kn", rawValue: (row) => row.windSpeed },
  { feature: "humidity_pct", rawValue: (row) => row.humidity },
  { feature: "solar_radiation_wm2", rawValue: (row) => row.solarRadiation },
  { feature: "pressure_hpa", rawValue: (row) => row.pressure },
  { feature: "current_velocity_kn", rawValue: (row) => row.currentVelocity },
  { feature: "wave_height_m", rawValue: (row) => row.waveHeight },
];

const EPSILON = 0.005;

function directionOf(value: number): "positive" | "negative" | "neutral" {
  if (value > EPSILON) return "positive";
  if (value < -EPSILON) return "negative";
  return "neutral";
}

/** Collapses the 13 raw model features (which split direction into
 * sin/cos for the tree) back into the human-facing factors this page
 * lists, summing the sin+cos contribution pair and showing the
 * original degree value - the model's math is unaffected, this is
 * purely a display transform. */
function buildDisplayContributions(
  rawContributions: { feature: string; contribution: number }[],
  nowRow: HourlyRow,
  sstLag1h: number | null,
  sstLag24h: number | null
): DisplayContribution[] {
  const byFeature = new Map(rawContributions.map((c) => [c.feature, c.contribution]));
  const entries: Omit<DisplayContribution, "rank">[] = [];

  for (const { feature, rawValue } of SIMPLE_FEATURES) {
    const value = rawValue(nowRow);
    const contribution = byFeature.get(feature) ?? 0;
    if (value === null) continue;
    entries.push({
      feature: FEATURE_LABELS[feature],
      value: Math.round(value * 100) / 100,
      unit: FEATURE_UNITS[feature],
      contribution: Math.round(contribution * 1000) / 1000,
      direction: directionOf(contribution),
    });
  }

  for (const group of DIRECTION_GROUPS) {
    const value = group.rawValueDeg(nowRow);
    if (value === null) continue;
    const contribution = (byFeature.get(group.sinIndex) ?? 0) + (byFeature.get(group.cosIndex) ?? 0);
    entries.push({
      feature: group.label,
      value: Math.round(value * 10) / 10,
      unit: "°",
      contribution: Math.round(contribution * 1000) / 1000,
      direction: directionOf(contribution),
    });
  }

  if (sstLag1h !== null) {
    entries.push({
      feature: FEATURE_LABELS.sst_lag_1h_c,
      value: Math.round(sstLag1h * 100) / 100,
      unit: "°C",
      contribution: Math.round((byFeature.get("sst_lag_1h_c") ?? 0) * 1000) / 1000,
      direction: directionOf(byFeature.get("sst_lag_1h_c") ?? 0),
    });
  }
  if (sstLag24h !== null) {
    entries.push({
      feature: FEATURE_LABELS.sst_lag_24h_c,
      value: Math.round(sstLag24h * 100) / 100,
      unit: "°C",
      contribution: Math.round((byFeature.get("sst_lag_24h_c") ?? 0) * 1000) / 1000,
      direction: directionOf(byFeature.get("sst_lag_24h_c") ?? 0),
    });
  }

  return entries
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export interface SstPredictionSuccess {
  status: "success";
  location: { latitude: number; longitude: number };
  currentSst: number;
  sstObservedAt: string;
  sstFetchedAt: string;
  predictedSst: number;
  predictionHorizon: string;
  predictionGeneratedAt: string;
  uncertainty: { lower: number; upper: number; method: string } | null;
  featureContributions: DisplayContribution[];
  contributionMethod: string;
  modelInfo: TrainedModelInfo;
  limitations: string[];
  sourceMetadata: typeof SOURCE_METADATA;
}

export type SstPredictionResponse = SstPredictionSuccess | { status: "insufficient_data"; data: DataReadinessResult };

export async function predictSst(latitude: number, longitude: number): Promise<SstPredictionResponse> {
  const trained = await getOrTrainModel(latitude, longitude);
  if ("status" in trained) {
    return { status: "insufficient_data", data: trained };
  }
  const { model, info } = trained;

  // past_days=3 guarantees >=24h of real lookback even accounting for
  // Open-Meteo's own ingestion lag for the very latest hour.
  const recentRows = await fetchRecentHourly(latitude, longitude, 3);
  const live = buildLiveFeatureVector(recentRows);

  if (!live) {
    return {
      status: "insufficient_data",
      data: {
        status: "insufficient",
        latitude,
        longitude,
        historicalWindow: info.dataWindow,
        totalHourlyRowsFetched: recentRows.length,
        usableRows: 0,
        minimumRequiredRows: 1,
        reason: "Current conditions could not be assembled: at least one required live field (weather or marine) was missing for this location.",
      },
    };
  }

  const { x, nowRow, nowIndex } = live;
  const sstLag1h = recentRows[nowIndex - 1]?.sst ?? null;
  const sstLag24h = recentRows[nowIndex - 24]?.sst ?? null;

  const predictedSst = predictGradientBoosting(model, x);
  const rawContributions = localContributions(model, x);
  const featureContributions = buildDisplayContributions(rawContributions, nowRow, sstLag1h, sstLag24h);

  const uncertainty =
    info.validationResidualStdDev > 0
      ? {
          lower: Math.round((predictedSst - info.validationResidualStdDev) * 100) / 100,
          upper: Math.round((predictedSst + info.validationResidualStdDev) * 100) / 100,
          method: "±1 standard deviation of validation-set residuals (empirical, not a formal statistical confidence interval)",
        }
      : null;

  const limitations = [
    `Training window: trailing ${TRAINING_WINDOW_DAYS} days ending ${info.dataWindow.end} at this location only - not a multi-year or multi-location climatology, so seasonal extremes outside this window are not represented.`,
    "SST, currents, and waves are Open-Meteo's own marine model output, not direct satellite/buoy observation.",
    "Feature contributions show how model inputs influenced this prediction; they are not proof of physical causation.",
    "SHAP TreeExplainer was not used (no Python/sklearn runtime available here) - contributions use the Saabas exact tree-path decomposition instead, cross-checked against global permutation importance.",
    info.validationLabel === "MODEL NOT VALIDATED"
      ? "This model did NOT beat the persistence baseline on held-out test data - treat its predictions as informational only, not as a validated forecast."
      : `Model beat the persistence baseline on held-out test data (test MAE ${info.metrics.test.mae}°C vs baseline ${info.baseline.test.mae}°C).`,
  ];

  return {
    status: "success",
    location: { latitude, longitude },
    currentSst: Math.round(nowRow.sst! * 100) / 100,
    sstObservedAt: nowRow.timestamp,
    sstFetchedAt: new Date().toISOString(),
    predictedSst: Math.round(predictedSst * 100) / 100,
    predictionHorizon: `+${HORIZON_HOURS}h`,
    predictionGeneratedAt: new Date().toISOString(),
    uncertainty,
    featureContributions,
    contributionMethod: "Saabas tree-path decomposition (exact for this model; see modelInfo.permutationImportance for a global cross-check)",
    modelInfo: info,
    limitations,
    sourceMetadata: SOURCE_METADATA,
  };
}
