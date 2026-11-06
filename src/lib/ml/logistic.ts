// Logistic regression trained with plain gradient descent.

export interface LogisticModel {
  weights: number[];
  bias: number;
  /** Used to put features on a similar scale. Learned from training data only. */
  means: number[];
  stds: number[];
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function predictScore(model: LogisticModel, features: readonly number[]): number {
  const total = features.reduce((sum, value, i) => {
    const scaled = (value - model.means[i]) / model.stds[i];
    return sum + scaled * model.weights[i];
  }, model.bias);
  return sigmoid(total);
}

export interface TrainOptions {
  iterations?: number;
  learningRate?: number;
  l2?: number;
}

/**
 * Unusual rows are rare, so positives get more weight in training. Without this the
 * model can score well by mostly ignoring them. A side effect: scores are rankings,
 * not true probabilities, and a score of 0.8 does not mean an "80% chance".
 */
export function trainLogistic(
  rows: readonly number[][],
  labels: readonly number[],
  { iterations = 1500, learningRate = 0.1, l2 = 0.001 }: TrainOptions = {},
): LogisticModel {
  const size = rows[0].length;
  const means = Array.from({ length: size }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / rows.length);
  const stds = means.map((mean, j) => {
    const variance = rows.reduce((s, r) => s + (r[j] - mean) ** 2, 0) / rows.length;
    return Math.sqrt(variance) || 1;
  });
  const scaled = rows.map((r) => r.map((v, j) => (v - means[j]) / stds[j]));

  const positives = labels.reduce((s, l) => s + l, 0);
  const positiveWeight = (labels.length - positives) / Math.max(positives, 1);
  const totalWeight = labels.reduce((s, l) => s + (l === 1 ? positiveWeight : 1), 0);

  const weights = new Array<number>(size).fill(0);
  let bias = 0;

  for (let step = 0; step < iterations; step++) {
    const gradient = new Array<number>(size).fill(0);
    let biasGradient = 0;
    scaled.forEach((row, i) => {
      const total = row.reduce((s, v, j) => s + v * weights[j], bias);
      const error = (sigmoid(total) - labels[i]) * (labels[i] === 1 ? positiveWeight : 1);
      row.forEach((v, j) => {
        gradient[j] += error * v;
      });
      biasGradient += error;
    });
    for (let j = 0; j < size; j++) {
      weights[j] -= learningRate * (gradient[j] / totalWeight + l2 * weights[j]);
    }
    bias -= (learningRate * biasGradient) / totalWeight;
  }

  return { weights, bias, means, stds };
}
