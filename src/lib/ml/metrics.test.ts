import { describe, expect, it } from "vitest";
import { averagePrecision, confusionMatrix, f1, precision, recall } from "./metrics";

describe("confusion matrix and rates", () => {
  const m = confusionMatrix([1, 1, 1, 0, 0, 0, 0], [true, true, false, true, false, false, false]);

  it("counts each cell", () => {
    expect(m).toEqual({ truePositive: 2, falsePositive: 1, trueNegative: 3, falseNegative: 1 });
  });

  it("computes precision, recall and F1 by hand", () => {
    expect(precision(m)).toBeCloseTo(2 / 3);
    expect(recall(m)).toBeCloseTo(2 / 3);
    expect(f1(m)).toBeCloseTo(2 / 3);
  });

  it("returns null rather than a fake number when undefined", () => {
    const none = confusionMatrix([1, 0], [false, false]);
    expect(precision(none)).toBeNull();
    expect(recall(confusionMatrix([0], [true]))).toBeNull();
    expect(f1(none)).toBe(0);
  });
});

describe("average precision", () => {
  it("matches a hand calculation", () => {
    // Rank 1 is positive: P=1, R=.5. Rank 3 is positive: P=2/3, R=1.
    expect(averagePrecision([1, 0, 1], [0.9, 0.8, 0.7])).toBeCloseTo(0.5 + 0.5 * (2 / 3));
  });

  it("is 1 for a perfect ranking", () => {
    expect(averagePrecision([0, 1, 1, 0], [0.1, 0.9, 0.8, 0.2])).toBe(1);
  });

  it("gives the same answer when tied scores are reordered", () => {
    expect(averagePrecision([1, 0], [0.5, 0.5])).toBe(averagePrecision([0, 1], [0.5, 0.5]));
    expect(averagePrecision([1, 0], [0.5, 0.5])).toBeCloseTo(0.5);
  });

  it("returns null with no positives", () => {
    expect(averagePrecision([0, 0], [0.2, 0.1])).toBeNull();
  });
});
