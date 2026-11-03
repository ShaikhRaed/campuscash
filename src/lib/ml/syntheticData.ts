// A made-up labeled dataset. Its rules were written by the same author as the model,
// so the model is partly learning back patterns planted here. That is the central
// limit of this experiment: it cannot show how anything performs on real spending.
//
// Hard cases are planted on purpose: costly purchases that are perfectly normal
// (laptops, flights), unusual charges that look ordinary, and a few wrong labels.

import type { MlTransaction } from "./features";

export interface LabeledTransaction extends MlTransaction {
  studentId: string;
  label: 0 | 1;
  /** How this row was generated. Used for analysis, never as a feature. */
  kind: string;
}

export interface SyntheticConfig {
  seed: number;
  students: number;
  /** Chance that a normal transaction gets wrongly labeled unusual. */
  labelNoise: number;
  /** Unusual rows planted per student. */
  unusualPerStudent: [min: number, max: number];
}

export const DEFAULT_CONFIG: Omit<SyntheticConfig, "seed"> = {
  students: 100,
  labelNoise: 0.005,
  unusualPerStudent: [1, 6],
};

/** A small seeded random generator: the same seed always gives the same numbers. */
export function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = [
  { name: "dining", medianCents: 1100, spread: 0.45, perWeek: 3.5 },
  { name: "groceries", medianCents: 3200, spread: 0.35, perWeek: 1 },
  { name: "transport", medianCents: 1400, spread: 0.5, perWeek: 0.7 },
  { name: "personal", medianCents: 2200, spread: 0.6, perWeek: 0.5 },
  { name: "social", medianCents: 1800, spread: 0.55, perWeek: 0.6 },
  { name: "books", medianCents: 900, spread: 0.6, perWeek: 0.25 },
] as const;

const WEEKS = 16;

export function generateDataset(config: SyntheticConfig): LabeledTransaction[] {
  const random = makeRandom(config.seed);
  const between = (min: number, max: number) => min + random() * (max - min);
  const whole = (min: number, max: number) => Math.floor(between(min, max + 1));
  const normal = () =>
    Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  const logNormal = (median: number, spread: number) =>
    Math.max(100, Math.round(median * Math.exp(normal() * spread)));

  const dataset: LabeledTransaction[] = [];

  for (let s = 0; s < config.students; s++) {
    const studentId = `student_${String(s).padStart(3, "0")}`;
    const scale = between(0.7, 1.5);
    const rows: LabeledTransaction[] = [];
    const add = (
      day: number,
      merchant: string,
      category: string,
      amountCents: number,
      label: 0 | 1,
      kind: string,
    ) => rows.push({ studentId, day, merchant, category, amountCents, label, kind });

    // Ordinary life: repeat visits to a few favorites, sometimes somewhere new.
    for (const c of CATEGORIES) {
      const favorites = Array.from({ length: 3 }, () => `${c.name}_${whole(0, 11)}`);
      for (let week = 0; week < WEEKS; week++) {
        const visits = c.perWeek + normal() * 0.8;
        for (let v = 0; v < Math.round(Math.max(0, visits)); v++) {
          const merchant =
            random() < 0.08 ? `${c.name}_${whole(0, 39)}` : favorites[whole(0, 2)];
          const isNoise = random() < config.labelNoise;
          add(
            week * 7 + whole(0, 6),
            merchant,
            c.name,
            logNormal(c.medianCents * scale, c.spread),
            isNoise ? 1 : 0,
            isNoise ? "wrong_label" : "normal",
          );
        }
      }
    }

    // Costly but legitimate: looks unusual, is labeled normal.
    add(whole(0, 6), "campus_bookstore", "books", logNormal(14000, 0.3), 0, "legit_textbooks");
    for (let n = whole(0, 3); n > 0; n--) {
      const category = random() < 0.5 ? "personal" : "transport";
      add(whole(0, WEEKS * 7 - 1), `big_ticket_${whole(0, 19)}`, category, logNormal(18000, 0.5), 0, "legit_large");
    }

    // Planted unusual activity, from obvious to nearly invisible.
    const planted = whole(...config.unusualPerStudent);
    for (let n = 0; n < planted; n++) {
      const pick = random();
      const day = whole(0, WEEKS * 7 - 1);
      const c = CATEGORIES[whole(0, CATEGORIES.length - 1)];
      if (pick < 0.35) {
        add(day, `unfamiliar_${whole(0, 200)}`, c.name, logNormal(c.medianCents * 9, 0.5), 1, "unusual_large_new");
      } else if (pick < 0.6 && rows.length > 0) {
        const original = rows[whole(0, rows.length - 1)];
        add(original.day, original.merchant, original.category, original.amountCents, 1, "unusual_duplicate");
      } else if (pick < 0.85) {
        add(day, `unfamiliar_${whole(0, 200)}`, c.name, logNormal(c.medianCents * scale, c.spread), 1, "unusual_subtle");
      } else {
        const favorite = rows.find((r) => r.category === c.name) ?? rows[0];
        add(day, favorite.merchant, c.name, logNormal(c.medianCents * scale * 4, 0.3), 1, "unusual_spike");
      }
    }

    // Stable sort by day: a planted duplicate lands after its original.
    rows.sort((a, b) => a.day - b.day);
    dataset.push(...rows);
  }
  return dataset;
}

/**
 * Splits by student, so nobody appears in both training and testing. Splitting rows at
 * random would let the model be tested on people it has already seen.
 */
export function splitByStudent(
  dataset: readonly LabeledTransaction[],
  seed: number,
): Record<"train" | "validation" | "test", LabeledTransaction[]> {
  const ids = [...new Set(dataset.map((r) => r.studentId))];
  const random = makeRandom(seed ^ 0x5bd1e995);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const trainEnd = Math.floor(ids.length * 0.6);
  const validationEnd = Math.floor(ids.length * 0.8);
  const group = new Map<string, "train" | "validation" | "test">();
  ids.forEach((id, i) =>
    group.set(id, i < trainEnd ? "train" : i < validationEnd ? "validation" : "test"),
  );

  const split = { train: [], validation: [], test: [] } as Record<
    "train" | "validation" | "test",
    LabeledTransaction[]
  >;
  for (const row of dataset) split[group.get(row.studentId)!].push(row);
  return split;
}
