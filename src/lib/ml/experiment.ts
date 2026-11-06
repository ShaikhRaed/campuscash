// Trains and evaluates the anomaly model. The threshold is picked on validation data and
// the test set is only scored once, with a simple rule and random guessing as baselines.

import { extractFeatures, FEATURE_NAMES } from "./features";
import { predictScore, trainLogistic, type LogisticModel } from "./logistic";
import {
  averagePrecision,
  confusionMatrix,
  f1,
  precision,
  recall,
  type ConfusionMatrix,
} from "./metrics";
import {
  DEFAULT_CONFIG,
  generateDataset,
  splitByStudent,
  type LabeledTransaction,
} from "./syntheticData";

/** Features per student, because each student's history is separate. */
function featuresByStudent(rows: readonly LabeledTransaction[]) {
  const groups = new Map<string, LabeledTransaction[]>();
  for (const row of rows) {
    if (!groups.has(row.studentId)) groups.set(row.studentId, []);
    groups.get(row.studentId)!.push(row);
  }
  const features: number[][] = [];
  const ordered: LabeledTransaction[] = [];
  for (const group of groups.values()) {
    features.push(...extractFeatures(group));
    ordered.push(...group);
  }
  return { features, rows: ordered };
}

function bestThreshold(labels: number[], scores: number[]): number {
  const candidates = [...new Set(scores.map((s) => Math.round(s * 100) / 100))];
  let best = 0.5;
  let bestF1 = -1;
  for (const threshold of candidates.sort((a, b) => a - b)) {
    const value = f1(confusionMatrix(labels, scores.map((s) => s >= threshold)));
    if (value > bestF1) {
      bestF1 = value;
      best = threshold;
    }
  }
  return best;
}

export interface ThresholdRow {
  threshold: number;
  flagged: number;
  precision: number | null;
  recall: number | null;
  falsePositives: number;
}

export interface ExperimentResult {
  seed: number;
  counts: Record<"train" | "validation" | "test", { students: number; rows: number; positives: number }>;
  threshold: number;
  test: {
    confusion: ConfusionMatrix;
    precision: number | null;
    recall: number | null;
    prAuc: number | null;
    /** PR-AUC of random guessing is about the share of positives. */
    randomPrAuc: number;
  };
  ruleBaseline: {
    description: string;
    confusion: ConfusionMatrix;
    precision: number | null;
    recall: number | null;
    prAuc: number | null;
  };
  thresholdTable: ThresholdRow[];
  recallByKind: { kind: string; total: number; caught: number }[];
  model: LogisticModel;
}

const RULE_RATIO = Math.log(3);
const AMOUNT_RATIO_FEATURE = FEATURE_NAMES.indexOf("amount_vs_category_median");

export function runExperiment(seed: number): ExperimentResult {
  const dataset = generateDataset({ seed, ...DEFAULT_CONFIG });
  const split = splitByStudent(dataset, seed);

  const train = featuresByStudent(split.train);
  const validation = featuresByStudent(split.validation);
  const test = featuresByStudent(split.test);
  const labelsOf = (g: { rows: LabeledTransaction[] }) => g.rows.map((r) => r.label as number);

  const model = trainLogistic(train.features, labelsOf(train));

  const validationScores = validation.features.map((f) => predictScore(model, f));
  const threshold = bestThreshold(labelsOf(validation), validationScores);

  const testLabels = labelsOf(test);
  const testScores = test.features.map((f) => predictScore(model, f));
  const confusion = confusionMatrix(testLabels, testScores.map((s) => s >= threshold));

  const ruleScores = test.features.map((f) => f[AMOUNT_RATIO_FEATURE]);
  const ruleConfusion = confusionMatrix(testLabels, ruleScores.map((s) => s >= RULE_RATIO));

  const describe = (name: "train" | "validation" | "test") => ({
    students: new Set(split[name].map((r) => r.studentId)).size,
    rows: split[name].length,
    positives: split[name].filter((r) => r.label === 1).length,
  });

  const kinds = [...new Set(test.rows.map((r) => r.kind))].sort();
  return {
    seed,
    counts: { train: describe("train"), validation: describe("validation"), test: describe("test") },
    threshold,
    test: {
      confusion,
      precision: precision(confusion),
      recall: recall(confusion),
      prAuc: averagePrecision(testLabels, testScores),
      randomPrAuc: testLabels.reduce((s, l) => s + l, 0) / testLabels.length,
    },
    ruleBaseline: {
      description: "Flag if the amount is at least 3x the student's category median so far.",
      confusion: ruleConfusion,
      precision: precision(ruleConfusion),
      recall: recall(ruleConfusion),
      prAuc: averagePrecision(testLabels, ruleScores),
    },
    thresholdTable: [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => {
      const m = confusionMatrix(testLabels, testScores.map((s) => s >= t));
      return {
        threshold: t,
        flagged: m.truePositive + m.falsePositive,
        precision: precision(m),
        recall: recall(m),
        falsePositives: m.falsePositive,
      };
    }),
    recallByKind: kinds.map((kind) => {
      const indexes = test.rows.flatMap((r, i) => (r.kind === kind ? [i] : []));
      return {
        kind,
        total: indexes.length,
        caught: indexes.filter((i) => testScores[i] >= threshold).length,
      };
    }),
    model,
  };
}

export const PRIMARY_SEED = 2026;
export const OTHER_SEEDS = [11, 23, 37, 41];

/** Everything saved to ml-results.json. A test checks the saved file matches this. */
export function buildMlResults() {
  const primary = runExperiment(PRIMARY_SEED);
  const others = OTHER_SEEDS.map(runExperiment);
  return {
    config: DEFAULT_CONFIG,
    primary,
    seedRuns: [primary, ...others].map((r) => ({
      seed: r.seed,
      threshold: r.threshold,
      precision: r.test.precision,
      recall: r.test.recall,
      prAuc: r.test.prAuc,
      randomPrAuc: r.test.randomPrAuc,
      rulePrAuc: r.ruleBaseline.prAuc,
    })),
  };
}
