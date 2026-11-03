// The retrieval evaluation. Used by `npm run eval:retrieval`, and by a test that checks
// the saved results file still matches what the code produces.

import { CAMPUS_PASSAGES } from "@/data/campus/resources";
import {
  ANSWERABLE_QUESTIONS,
  HELD_OUT_ANSWERABLE,
  HELD_OUT_UNANSWERABLE,
  UNANSWERABLE_QUESTIONS,
} from "@/data/campus/evaluationQuestions";
import { answerQuestion, MIN_COVERAGE, rankAll } from "./answer";
import { recallAtK } from "./search";

const KS = [1, 3, 5];
const METHODS = ["keyword", "semantic", "hybrid"] as const;

function evaluate(
  answerable: { question: string; relevant: string[] }[],
  unanswerable: string[],
) {
  const recall = Object.fromEntries(
    METHODS.map((method) => [
      method,
      Object.fromEntries(
        KS.map((k) => {
          const total = answerable.reduce((sum, { question, relevant }) => {
            const ranked = rankAll(question)[method].map((r) => r.id);
            return sum + recallAtK(ranked, relevant, k);
          }, 0);
          return [k, total / answerable.length];
        }),
      ),
    ]),
  );
  return {
    answerable: answerable.length,
    unanswerable: unanswerable.length,
    recall,
    hybridMissesAt3: answerable
      .filter(
        ({ question, relevant }) =>
          recallAtK(rankAll(question).hybrid.map((r) => r.id), relevant, 3) < 1,
      )
      .map((q) => q.question),
    support: {
      answerableAnswered: answerable.filter((q) => answerQuestion(q.question).supported).length,
      answerableRefused: answerable
        .filter((q) => !answerQuestion(q.question).supported)
        .map((q) => q.question),
      unanswerableRefused: unanswerable.filter((q) => !answerQuestion(q).supported).length,
      unanswerableWronglyAnswered: unanswerable.filter((q) => answerQuestion(q).supported),
    },
  };
}

export function buildRetrievalResults() {
  return {
    passages: CAMPUS_PASSAGES.length,
    minCoverage: MIN_COVERAGE,
    development: evaluate(ANSWERABLE_QUESTIONS, UNANSWERABLE_QUESTIONS),
    heldOut: evaluate(HELD_OUT_ANSWERABLE, HELD_OUT_UNANSWERABLE),
  };
}
