// Evaluation math, written out so you can read it. Each function has a hand-checked
// test in metrics.test.ts. A positive means "labeled unusual" in the synthetic data.

export interface ConfusionMatrix {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
}

export function confusionMatrix(
  labels: readonly number[],
  predictions: readonly boolean[],
): ConfusionMatrix {
  const matrix = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
  labels.forEach((label, i) => {
    if (predictions[i]) {
      if (label === 1) matrix.truePositive += 1;
      else matrix.falsePositive += 1;
    } else if (label === 1) matrix.falseNegative += 1;
    else matrix.trueNegative += 1;
  });
  return matrix;
}

/** Of everything flagged, how much was really unusual? Null if nothing was flagged. */
export function precision(m: ConfusionMatrix): number | null {
  const flagged = m.truePositive + m.falsePositive;
  return flagged === 0 ? null : m.truePositive / flagged;
}

/** Of everything really unusual, how much was flagged? Null if there were no positives. */
export function recall(m: ConfusionMatrix): number | null {
  const positives = m.truePositive + m.falseNegative;
  return positives === 0 ? null : m.truePositive / positives;
}

export function f1(m: ConfusionMatrix): number {
  const p = precision(m) ?? 0;
  const r = recall(m) ?? 0;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

/**
 * PR-AUC as "average precision": walk down the list from highest score, and each time
 * recall rises, add (rise in recall x precision here). Equal scores are handled as one
 * group, so results don't depend on sort order. Null if there are no positives.
 */
export function averagePrecision(
  labels: readonly number[],
  scores: readonly number[],
): number | null {
  const positives = labels.reduce((sum, l) => sum + l, 0);
  if (positives === 0) return null;

  const ranked = labels
    .map((label, i) => ({ label, score: scores[i] }))
    .sort((a, b) => b.score - a.score);

  let area = 0;
  let truePositives = 0;
  let previousRecall = 0;
  let i = 0;
  while (i < ranked.length) {
    const score = ranked[i].score;
    while (i < ranked.length && ranked[i].score === score) {
      truePositives += ranked[i].label;
      i += 1;
    }
    const currentRecall = truePositives / positives;
    area += (currentRecall - previousRecall) * (truePositives / i);
    previousRecall = currentRecall;
  }
  return area;
}
