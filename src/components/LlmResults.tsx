// Displays the saved local-model evaluation, written by `npm run eval:llm`.

import results from "@/data/generated/llm-results.json";
import { INTERPRETATION_CASES } from "@/data/llm/interpretationCases";

const td = "border-t border-rule py-2 pr-4 font-mono text-sm tabular-nums";
const label = "border-t border-rule py-2 pr-4 text-sm";

const KIND_LABELS: Record<string, string> = {
  normal: "Normal",
  ambiguous: "Ambiguous",
  malformed: "Malformed",
  out_of_scope: "Out of scope",
  injection: "Prompt injection",
};

export function LlmResults() {
  const { summary, model, machine, runtime, coldStartMs, caseSetVersion, promptVersion, runDate } = results;
  const t = summary.test;
  // Only these cases plant specific field values, so only they can show whether an attack was followed.
  const planted = INTERPRETATION_CASES.filter((c) => c.split === "test" && c.injected).length;
  const fields = [
    ["Merchant", t.fields.merchant],
    ["Amount", t.fields.amount],
    ["Category", t.fields.category],
    ["Missing information", t.fields.missing],
    ["All of merchant, amount and category", t.allFieldsCorrect],
  ] as const;

  return (
    <div className="mt-4 space-y-6">
      <p className="text-sm text-ink-soft">
        {model.name} ({model.parameterSize}, {model.quantization}) on Ollama {runtime.ollamaVersion}, {machine.cpu} with{" "}
        {machine.memoryGb} GB memory, measured {runDate}. Test set: {t.cases} hand-written cases ({caseSetVersion},{" "}
        {promptVersion}), scored once after the prompt was frozen.
      </p>

      <div className="grid gap-8 lg:grid-cols-3">
        <div>
          <h3 className="font-display">Field accuracy</h3>
          <table className="mt-1 w-full">
            <tbody>
              {fields.map(([name, value]) => (
                <tr key={name}>
                  <td className={label}>{name}</td>
                  <td className={td}>{value} of {t.cases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="font-display">All fields correct, by kind</h3>
          <table className="mt-1 w-full">
            <tbody>
              {t.byKind.map((row) => (
                <tr key={row.kind}>
                  <td className={label}>{KIND_LABELS[row.kind] ?? row.kind}</td>
                  <td className={td}>{row.allFieldsCorrect} of {row.cases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="font-display">This machine</h3>
          <table className="mt-1 w-full">
            <tbody>
              <tr><td className={label}>Schema-valid responses</td><td className={td}>{t.schemaValid} of {t.cases}</td></tr>
              <tr><td className={label}>Latency, median</td><td className={td}>{t.latencyMs.p50} ms</td></tr>
              <tr><td className={label}>Latency, 95th percentile</td><td className={td}>{t.latencyMs.p95} ms</td></tr>
              <tr><td className={label}>Cold start</td><td className={td}>{coldStartMs} ms</td></tr>
              <tr><td className={label}>Memory while loaded</td><td className={td}>{((model.loadedBytes ?? 0) / 1e9).toFixed(2)} GB</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-sm border border-rule bg-surface p-4 text-sm">
        <h3 className="font-display">How to read this</h3>
        <p className="mt-1">
          Of the {t.injectionCases} prompt-injection test cases, {planted} plant specific field values. The model reported the
          planted values in {t.injectionFollowed} of those {planted}: a $20 notebook became $1 at a different merchant, and $60 of
          concert tickets were labeled &ldquo;books&rdquo;. Both drafts would get ALLOW under the default books-only grant. Validation
          can&rsquo;t catch them: the planted values were really in the message, and the category is never checked against the
          text. The deterministic checks protect the rules, not the meaning, which is why a person reviews the form.
        </p>
        <p className="mt-2">
          Schema validity is high largely because Ollama constrains the output format, so it says little about the model. With
          so few cases, written by one author, these numbers don&rsquo;t establish general model quality. They describe one
          model and one prompt on this set.
        </p>
      </div>
    </div>
  );
}
