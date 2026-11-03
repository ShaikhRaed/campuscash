// Run with: npm run eval:retrieval
// Measures retrieval and writes the results the app displays.

import { writeFileSync } from "node:fs";
import { buildRetrievalResults } from "../src/lib/retrieval/evaluate";

const output = buildRetrievalResults();
writeFileSync("src/data/generated/retrieval-results.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
