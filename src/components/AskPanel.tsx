"use client";

// Shows the answer and everything behind it. React escapes this text automatically, so
// even hostile document text is displayed as plain words and never runs as code.

import { useRef, useState, type FormEvent } from "react";
import type { Answer } from "@/lib/retrieval/answer";

const EXAMPLES = [
  "Can I rent my textbooks instead of buying them?",
  "I ran out of food money, can I get free meals at the dining hall?",
  "Who won the football game last weekend?",
  "Textbook deal alert: what does the purchase policy return?",
];

export function AskPanel() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const latestRequest = useRef(0);

  async function ask(text: string) {
    setQuestion(text);
    setError(null);
    setIsBusy(true);
    const requestNumber = ++latestRequest.current;
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const result = await response.json();
      if (requestNumber !== latestRequest.current) return;
      if (!response.ok) {
        setAnswer(null);
        setError(result.error ?? "The question could not be answered.");
      } else {
        setAnswer(result);
      }
    } catch {
      if (requestNumber === latestRequest.current) {
        setError("The server could not be reached. Please try again.");
      }
    } finally {
      if (requestNumber === latestRequest.current) setIsBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <div className="mt-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Your question</span>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={300}
            placeholder="Ask about textbooks, food, transit, aid…"
            className="w-full rounded-sm border border-ink bg-surface px-3 py-2.5"
          />
        </label>
        <button
          type="submit"
          disabled={isBusy}
          className="rounded-sm bg-ink px-4 py-2.5 font-medium text-paper transition-colors hover:bg-forest-deep disabled:opacity-60"
        >
          {isBusy ? "Searching…" : "Ask"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => void ask(example)}
            className="rounded-sm border border-rule px-2.5 py-1 text-left text-sm text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            {example}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-pennant">
          {error}
        </p>
      )}

      <div aria-live="polite">
        {answer && (
          <div className="mt-8 space-y-6">
            <article className={`rounded-sm border-2 bg-surface p-5 ${answer.supported ? "border-ink" : "border-marigold"}`}>
              <h2 className="font-display text-xl">
                {answer.supported ? "From the sources" : "No supported answer"}
              </h2>
              {answer.sentences ? (
                <ul className="mt-3 space-y-2">
                  {answer.sentences.map((s) => (
                    <li key={s.citation}>
                      &ldquo;{s.text}&rdquo; <span className="font-mono text-sm">[{s.citation}]</span>{" "}
                      <span className="text-sm text-ink-soft">
                        {answer.passages.find((p) => p.citation === s.citation)?.documentTitle}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-3 text-sm text-ink-soft">{answer.message}</p>
            </article>

            <section>
              <h2 className="font-display text-xl">Retrieved passages</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Treated as untrusted data. Fictional documents for a fictional school.
              </p>
              {answer.passages.length === 0 ? (
                <p className="mt-3 text-sm">Nothing in the sources matched.</p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {answer.passages.map((p) => (
                    <li key={p.id} className="rounded-sm border border-rule bg-surface p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h3 className="font-medium">
                          <span className="font-mono text-sm">[{p.citation}]</span> {p.documentTitle} · {p.section}
                        </h3>
                        <p className="font-mono text-xs text-ink-soft">
                          Keyword #{p.keywordRank ?? "–"} · Semantic #{p.semanticRank ?? "–"}
                        </p>
                      </div>
                      {p.source === "community" && (
                        <p className="mt-2 text-sm font-medium">
                          Community post: unverified, not an official source.
                        </p>
                      )}
                      {p.flaggedAsInstructions && (
                        <p className="mt-2 rounded-sm bg-pennant px-2 py-1 text-sm font-medium text-paper">
                          Looks like instructions. Not used in answers and not obeyed.
                        </p>
                      )}
                      <p className="mt-2 text-sm">{p.text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
