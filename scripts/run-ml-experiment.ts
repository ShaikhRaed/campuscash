// Run with: npm run eval:ml
// Trains the model, evaluates it, and writes the results the app displays. Nothing in
// the results file is typed by hand.

import { writeFileSync } from "node:fs";
import { buildMlResults } from "../src/lib/ml/experiment";

const output = buildMlResults();
writeFileSync("src/data/generated/ml-results.json", `${JSON.stringify(output, null, 2)}\n`);

const { primary, seedRuns } = output;
const show = (v: number | null) => (v === null ? "n/a" : v.toFixed(3));
console.log("Split:", primary.counts);
console.log("Threshold (chosen on validation):", primary.threshold);
console.log("Test confusion:", primary.test.confusion);
console.log(
  `Test precision ${show(primary.test.precision)}, recall ${show(primary.test.recall)}, PR-AUC ${show(primary.test.prAuc)}, random PR-AUC ${show(primary.test.randomPrAuc)}`,
);
console.log(
  `Rule baseline precision ${show(primary.ruleBaseline.precision)}, recall ${show(primary.ruleBaseline.recall)}, PR-AUC ${show(primary.ruleBaseline.prAuc)}`,
);
console.table(primary.thresholdTable);
console.table(primary.recallByKind);
console.table(seedRuns);
