// Displays the saved experiment results. Every number comes from the results file, so
// this page cannot drift from what `npm run eval:ml` measured.

import results from "@/data/generated/ml-results.json";

const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) => (v === null ? "n/a" : v.toFixed(3));

const th = "py-2 pr-4 text-left text-xs font-medium text-ink-soft";
const td = "border-t border-rule py-2 pr-4 font-mono text-sm tabular-nums";

const KIND_LABELS: Record<string, string> = {
  legit_large: "Normal: large purchase",
  legit_textbooks: "Normal: textbooks",
  normal: "Normal: everyday",
  wrong_label: "Normal, wrongly labeled unusual",
  unusual_duplicate: "Unusual: duplicate charge",
  unusual_large_new: "Unusual: large, new merchant",
  unusual_spike: "Unusual: spike at familiar merchant",
  unusual_subtle: "Unusual: ordinary-looking, new merchant",
};

export function MlResults() {
  const { primary, seedRuns } = results;
  const { confusion, precision, recall, prAuc, randomPrAuc } = primary.test;
  const { test: counts } = primary.counts;
  const prAucs = seedRuns.map((r) => r.prAuc);
  const alwaysNormalAccuracy = 1 - counts.positives / counts.rows;
  const flagged = confusion.truePositive + confusion.falsePositive;

  return (
    <div className="mt-6 space-y-8">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Precision", pct(precision)],
          ["Recall", pct(recall)],
          ["PR-AUC", num(prAuc)],
          ["Random PR-AUC", num(randomPrAuc)],
        ].map(([label, value]) => (
          <div key={label} className="border-t-2 border-ink pt-2">
            <dt className="text-sm text-ink-soft">{label}</dt>
            <dd className="text-3xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-ink-soft">
        Test set: {counts.students} synthetic students the model never saw, {counts.rows} rows,{" "}
        {counts.positives} labeled unusual. Flag level {primary.threshold.toFixed(2)}, chosen on
        separate validation data.
      </p>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="font-display text-xl">Confusion matrix</h3>
          <table className="mt-2 w-full">
            <thead>
              <tr>
                <td />
                <th scope="col" className={th}>Flagged</th>
                <th scope="col" className={th}>Not flagged</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className={`${th} border-t border-rule`}>Labeled unusual</th>
                <td className={td}>{confusion.truePositive} caught</td>
                <td className={td}>{confusion.falseNegative} missed</td>
              </tr>
              <tr>
                <th scope="row" className={`${th} border-t border-rule`}>Labeled normal</th>
                <td className={td}>{confusion.falsePositive} false alarms</td>
                <td className={td}>{confusion.trueNegative} correctly passed</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-sm">
            <span className="font-medium">Precision:</span> of {flagged} flags,{" "}
            {confusion.truePositive} were labeled unusual.{" "}
            <span className="font-medium">Recall:</span> of {counts.positives} unusual rows, the
            model found {confusion.truePositive}.
          </p>
        </div>

        <div>
          <h3 className="font-display text-xl">Moving the flag level</h3>
          <table className="mt-2 w-full">
            <thead>
              <tr>
                <th scope="col" className={th}>Level</th>
                <th scope="col" className={th}>Flags</th>
                <th scope="col" className={th}>Precision</th>
                <th scope="col" className={th}>Recall</th>
              </tr>
            </thead>
            <tbody>
              {primary.thresholdTable.map((row) => (
                <tr key={row.threshold}>
                  <td className={td}>{row.threshold.toFixed(1)}</td>
                  <td className={td}>{row.flagged}</td>
                  <td className={td}>{pct(row.precision)}</td>
                  <td className={td}>{pct(row.recall)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm">
            A lower level catches more but raises more false alarms, and each one costs a student
            time and trust. A higher level is quieter but misses more. No level is simply correct:
            the choice depends on which mistake matters more.
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="font-display text-xl">What it catches and misses</h3>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full">
              <thead>
                <tr>
                  <th scope="col" className={th}>Generated as</th>
                  <th scope="col" className={th}>Flagged</th>
                </tr>
              </thead>
              <tbody>
                {primary.recallByKind.map((row) => (
                  <tr key={row.kind}>
                    <td className="border-t border-rule py-2 pr-4 text-sm">
                      {KIND_LABELS[row.kind] ?? row.kind}
                    </td>
                    <td className={td}>
                      {row.caught} of {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="font-display text-xl">Compared with what?</h3>
          <table className="mt-2 w-full">
            <thead>
              <tr>
                <th scope="col" className={th}>Approach</th>
                <th scope="col" className={th}>PR-AUC</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-t border-rule py-2 pr-4 text-sm">Logistic regression</td>
                <td className={td}>{num(prAuc)}</td>
              </tr>
              <tr>
                <td className="border-t border-rule py-2 pr-4 text-sm">
                  Simple rule (amount vs. category median)
                </td>
                <td className={td}>{num(primary.ruleBaseline.prAuc)}</td>
              </tr>
              <tr>
                <td className="border-t border-rule py-2 pr-4 text-sm">Random guessing</td>
                <td className={td}>{num(randomPrAuc)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-sm">
            Regenerating the data with {seedRuns.length} different seeds gave a PR-AUC between{" "}
            {num(Math.min(...prAucs))} and {num(Math.max(...prAucs))}, so a single figure is not
            exact.
          </p>
        </div>
      </div>

      <div className="grid gap-6 rounded-sm border border-rule bg-surface p-5 md:grid-cols-2">
        <div>
          <h3 className="font-display text-xl">Why accuracy would mislead</h3>
          <p className="mt-2 text-sm">
            Only {pct(randomPrAuc)} of test rows are labeled unusual. This is called class
            imbalance. A model that calls everything normal would be{" "}
            {pct(alwaysNormalAccuracy)} accurate and catch nothing, so we use precision, recall
            and PR-AUC instead.
          </p>
        </div>
        <div>
          <h3 className="font-display text-xl">What this does not show</h3>
          <p className="mt-2 text-sm">
            This is not fraud detection. The same author wrote the data rules and the model, so it
            is partly relearning planted patterns. These numbers say nothing about real students,
            real fraud, or even the sample profiles in this app, which were made differently.
          </p>
        </div>
      </div>
    </div>
  );
}
