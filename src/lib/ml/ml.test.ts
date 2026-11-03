import { describe, expect, it } from "vitest";
import saved from "@/data/generated/ml-results.json";
import { buildMlResults, runExperiment } from "./experiment";
import { extractFeatures, FEATURE_NAMES } from "./features";
import { predictScore, trainLogistic } from "./logistic";
import { DEFAULT_CONFIG, generateDataset, makeRandom, splitByStudent } from "./syntheticData";

describe("synthetic data", () => {
  const config = { seed: 7, ...DEFAULT_CONFIG };

  it("is reproducible from its seed and differs across seeds", () => {
    expect(generateDataset(config)).toEqual(generateDataset(config));
    expect(generateDataset({ ...config, seed: 8 })).not.toEqual(generateDataset(config));
    expect(makeRandom(1)()).toBe(makeRandom(1)());
  });

  it("is imbalanced, with unusual rows as a small minority", () => {
    const rows = generateDataset(config);
    const share = rows.filter((r) => r.label === 1).length / rows.length;
    expect(share).toBeGreaterThan(0.005);
    expect(share).toBeLessThan(0.1);
  });

  it("never puts one student in two splits", () => {
    const split = splitByStudent(generateDataset(config), 7);
    const ids = (rows: { studentId: string }[]) => new Set(rows.map((r) => r.studentId));
    const train = ids(split.train);
    const test = ids(split.test);
    const validation = ids(split.validation);
    expect([...test].some((id) => train.has(id) || validation.has(id))).toBe(false);
    expect([...validation].some((id) => train.has(id))).toBe(false);
  });
});

describe("features", () => {
  const history = [
    { day: 0, merchant: "a", category: "dining", amountCents: 1000 },
    { day: 1, merchant: "a", category: "dining", amountCents: 1000 },
    { day: 1, merchant: "a", category: "dining", amountCents: 1000 },
    { day: 2, merchant: "b", category: "dining", amountCents: 9000 },
  ];

  it("does not let later transactions change earlier features", () => {
    const shorter = extractFeatures(history.slice(0, 3));
    expect(extractFeatures(history).slice(0, 3)).toEqual(shorter);
  });

  it("marks new merchants and same-day duplicates", () => {
    const features = extractFeatures(history);
    const at = (name: (typeof FEATURE_NAMES)[number]) => FEATURE_NAMES.indexOf(name);
    expect(features[0][at("new_merchant")]).toBe(1);
    expect(features[1][at("new_merchant")]).toBe(0);
    expect(features[2][at("same_amount_same_merchant_same_day")]).toBe(1);
    expect(features[3][at("amount_vs_category_median")]).toBeCloseTo(Math.log(9));
  });
});

describe("logistic regression", () => {
  it("learns a simple separable pattern", () => {
    const rows = [[0], [0.2], [0.1], [0.3], [5], [5.2]];
    const model = trainLogistic(rows, [0, 0, 0, 0, 1, 1]);
    expect(predictScore(model, [5.1])).toBeGreaterThan(predictScore(model, [0.1]));
  });

  it("survives a feature that never varies", () => {
    const model = trainLogistic([[1, 0], [1, 1]], [0, 1], { iterations: 10 });
    expect(Number.isFinite(predictScore(model, [1, 1]))).toBe(true);
  });
});

describe("experiment", () => {
  it("is deterministic for a seed", () => {
    expect(runExperiment(3).test).toEqual(runExperiment(3).test);
  }, 60_000);
});

describe("saved results", () => {
  const { primary, seedRuns } = saved;
  const { confusion, test: counts } = { confusion: primary.test.confusion, test: primary.counts.test };

  it("match what the code produces, so no number is hand-edited", () => {
    expect(saved).toEqual(JSON.parse(JSON.stringify(buildMlResults())));
  }, 60_000);

  it("are internally consistent", () => {
    const total = confusion.truePositive + confusion.falsePositive + confusion.trueNegative + confusion.falseNegative;
    expect(total).toBe(counts.rows);
    expect(confusion.truePositive + confusion.falseNegative).toBe(counts.positives);
    expect(primary.test.precision).toBeCloseTo(
      confusion.truePositive / (confusion.truePositive + confusion.falsePositive),
    );
    expect(primary.test.recall).toBeCloseTo(confusion.truePositive / counts.positives);
    expect(primary.test.randomPrAuc).toBeCloseTo(counts.positives / counts.rows);
  });

  it("beat random guessing on every seed, which is the minimum bar", () => {
    for (const run of seedRuns) expect(run.prAuc!).toBeGreaterThan(run.randomPrAuc);
  });

  it("show precision rising and recall falling as the threshold rises", () => {
    const rows = primary.thresholdTable;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].recall!).toBeLessThanOrEqual(rows[i - 1].recall!);
      expect(rows[i].precision!).toBeGreaterThanOrEqual(rows[i - 1].precision!);
    }
  });
});
