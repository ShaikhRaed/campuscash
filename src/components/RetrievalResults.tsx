// Displays saved retrieval results, written by `npm run eval:retrieval`.

import results from "@/data/generated/retrieval-results.json";

const th = "py-2 pr-4 text-left text-xs font-medium text-ink-soft";
const td = "border-t border-rule py-2 pr-4 font-mono text-sm tabular-nums";
const METHODS = [
  ["keyword", "Keyword (BM25)"],
  ["semantic", "Semantic (LSA)"],
  ["hybrid", "Hybrid (RRF)"],
] as const;
const KS = ["1", "3", "5"] as const;

function RecallTable({ set }: { set: Pick<typeof results.heldOut, "recall"> }) {
  return (
    <table className="mt-2 w-full">
      <thead>
        <tr>
          <th scope="col" className={th}>Method</th>
          {KS.map((k) => (
            <th key={k} scope="col" className={th}>Recall@{k}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {METHODS.map(([key, label]) => (
          <tr key={key}>
            <td className="border-t border-rule py-2 pr-4 text-sm">{label}</td>
            {KS.map((k) => (
              <td key={k} className={td}>{set.recall[key][k].toFixed(2)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RetrievalResults() {
  const { heldOut, development } = results;
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="font-display text-xl">Held-out questions</h3>
          <p className="mt-1 text-sm text-ink-soft">
            {heldOut.answerable} answerable, {heldOut.unanswerable} unanswerable. Scored once, after
            the settings were fixed.
          </p>
          <RecallTable set={heldOut} />
          <p className="mt-3 text-sm">
            Answered {heldOut.support.answerableAnswered} of {heldOut.answerable} answerable.
            Refused {heldOut.support.unanswerableRefused} of {heldOut.unanswerable} unanswerable.
          </p>
        </div>
        <div>
          <h3 className="font-display text-xl">Development questions</h3>
          <p className="mt-1 text-sm text-ink-soft">
            {development.answerable} answerable, {development.unanswerable} unanswerable. Used to adjust
            the refusal threshold, so its refusal figures are optimistic.
          </p>
          <RecallTable set={development} />
          <p className="mt-3 text-sm">
            Answered {development.support.answerableAnswered} of {development.answerable} answerable.
            Refused {development.support.unanswerableRefused} of {development.unanswerable} unanswerable.
          </p>
        </div>
      </div>
      <div className="rounded-sm border border-rule bg-surface p-5 text-sm">
        <h3 className="font-display text-xl">How to read this</h3>
        <p className="mt-2">
          Recall@k is the share of questions whose correct passage appears in the top k results. With
          so few questions, one question moves a held-out score by 0.10, so small gaps between methods
          are not meaningful. These results do not show that hybrid beats keyword search. The same
          author wrote the documents and questions, and whether each quote truly answers its question
          was not measured.
        </p>
      </div>
    </div>
  );
}
