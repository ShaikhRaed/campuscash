// Builds an answer only from retrieved text, by quoting it, so nothing is generated
// or invented. There is no language model. Retrieved text is treated as untrusted data:
//   - It is displayed, never executed or passed to the purchase policy.
//   - Passages that look like instructions are left out of answers and labeled.
//   - If the sources don't cover the question's key words, the app says so.

import { CAMPUS_PASSAGES, type CampusPassage } from "@/data/campus/resources";
import {
  buildIndex,
  keywordSearch,
  reciprocalRankFusion,
  semanticSearch,
  tokenize,
  type SearchIndex,
} from "./search";

/**
 * Share of the question's key words that must appear in the top passages. First tried
 * at 0.6, which refused too many answerable development questions, so it was lowered
 * once. Trust the held-out results in the README, not the development ones.
 */
export const MIN_COVERAGE = 0.5;
export const TOP_K = 3;

/** A heuristic and easy to evade, so safety must not depend on it. See the tests. */
const INSTRUCTION_PATTERN =
  /\b(ignore (all |any )?(previous|prior|above)|system override|disregard (the |all )?(rules|instructions)|must return (allow|deny)|do not tell)\b/i;

export function looksLikeInstructions(text: string): boolean {
  return INSTRUCTION_PATTERN.test(text);
}

export interface RetrievedPassage extends CampusPassage {
  keywordRank: number | null;
  semanticRank: number | null;
  flaggedAsInstructions: boolean;
  citation: number;
}

export interface Answer {
  question: string;
  supported: boolean;
  /** Quoted sentences with citation numbers. Null when unsupported. */
  sentences: { text: string; citation: number }[] | null;
  message: string;
  coverage: number;
  passages: RetrievedPassage[];
}

let cachedIndex: SearchIndex | null = null;
const getIndex = () => (cachedIndex ??= buildIndex(CAMPUS_PASSAGES));

export function rankAll(question: string) {
  const index = getIndex();
  const keyword = keywordSearch(index, question);
  const semantic = semanticSearch(index, question);
  return { keyword, semantic, hybrid: reciprocalRankFusion([keyword, semantic]) };
}

const splitSentences = (text: string) => text.match(/[^.!?]+(?:\.(?=\s|$)|[!?]|$)/g)?.map((s) => s.trim()) ?? [text];

export function answerQuestion(question: string): Answer {
  const { keyword, semantic, hybrid } = rankAll(question);
  const position = (list: { id: string }[], id: string) => {
    const i = list.findIndex((r) => r.id === id);
    return i === -1 ? null : i + 1;
  };

  const passages: RetrievedPassage[] = hybrid.slice(0, TOP_K).map(({ id }, i) => {
    const passage = CAMPUS_PASSAGES.find((p) => p.id === id)!;
    return {
      ...passage,
      keywordRank: position(keyword, id),
      semanticRank: position(semantic, id),
      flaggedAsInstructions: looksLikeInstructions(passage.text),
      citation: i + 1,
    };
  });

  const usable = passages.filter((p) => !p.flaggedAsInstructions);
  const queryTerms = [...new Set(tokenize(question))];
  const usableTerms = new Set(usable.flatMap((p) => tokenize(p.text)));
  const coverage =
    queryTerms.length === 0
      ? 0
      : queryTerms.filter((t) => usableTerms.has(t)).length / queryTerms.length;

  if (coverage < MIN_COVERAGE || usable.length === 0) {
    return {
      question,
      supported: false,
      sentences: null,
      message: "The sample campus sources don't support an answer to this question.",
      coverage,
      passages,
    };
  }

  // Quote the best-matching sentence from each of the top two usable passages.
  const sentences = usable.slice(0, 2).flatMap((p) => {
    let best = "";
    let bestOverlap = 0;
    for (const sentence of splitSentences(p.text)) {
      const tokens = new Set(tokenize(sentence));
      const overlap = queryTerms.filter((t) => tokens.has(t)).length;
      if (overlap > bestOverlap) {
        best = sentence;
        bestOverlap = overlap;
      }
    }
    return best ? [{ text: best, citation: p.citation }] : [];
  });

  if (sentences.length === 0) {
    return {
      question,
      supported: false,
      sentences: null,
      message: "The sample campus sources don't support an answer to this question.",
      coverage,
      passages,
    };
  }
  return {
    question,
    supported: true,
    sentences,
    message: "Quoted from the sources below. Check them before relying on this.",
    coverage,
    passages,
  };
}
