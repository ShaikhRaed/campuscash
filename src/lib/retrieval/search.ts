// Three ways to rank passages:
//   Keyword (BM25): rewards rare words the question and passage share.
//   Semantic (LSA): compares "topics" learned from which words appear together, so a
//     passage can rank well with few exact matches. This is a classic statistical
//     method, far weaker than modern neural embeddings, and needs no download or key.
//   Hybrid (RRF): combines the two lists using rank positions, not raw scores.

const STOP_WORDS = new Set(
  "a about after all also am an and any are as at be been before but by can could did do does for from get got had has have how i if in into is it its me more most my no not of on or our so some than that the their them then there these they this to too up us was we were what when where which who why will with would you your".split(" "),
);

/** Crude stemming: "textbooks" and "textbook" should match. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => !STOP_WORDS.has(w))
    .map(stem);
}

export interface Ranked {
  id: string;
  score: number;
}

export interface SearchIndex {
  ids: string[];
  /** Tokens for each passage. */
  documents: string[][];
  vocabulary: Map<string, number>;
  documentFrequency: number[];
  averageLength: number;
  lsa: { documentVectors: number[][]; termProjection: number[][] };
}

const BM25_K1 = 1.5;
const BM25_B = 0.75;
const LSA_DIMENSIONS = 12;
const JACOBI_SWEEPS = 60;

function idfOf(index: Pick<SearchIndex, "ids" | "documentFrequency">, term: number): number {
  const n = index.documentFrequency[term];
  return Math.log(1 + (index.ids.length - n + 0.5) / (n + 0.5));
}

/** Eigen-decomposition of a symmetric matrix by Jacobi rotations. Deterministic. */
function symmetricEigen(input: number[][]) {
  const size = input.length;
  const a = input.map((row) => [...row]);
  const v = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j): number => (i === j ? 1 : 0)),
  );
  for (let sweep = 0; sweep < JACOBI_SWEEPS; sweep++) {
    let offDiagonal = 0;
    for (let p = 0; p < size - 1; p++) {
      for (let q = p + 1; q < size; q++) {
        offDiagonal += a[p][q] ** 2;
        if (Math.abs(a[p][q]) < 1e-12) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta ** 2 + 1));
        const c = 1 / Math.sqrt(t ** 2 + 1);
        const s = t * c;
        for (let k = 0; k < size; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < size; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < size; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
    if (offDiagonal < 1e-18) break;
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}

/**
 * `dimensions` must be well below the number of passages. Compressing into few topics
 * is what lets LSA relate passages that share no words. Keeping every dimension would
 * just reproduce exact word matching.
 */
export function buildIndex(
  passages: readonly { id: string; text: string }[],
  dimensions = LSA_DIMENSIONS,
): SearchIndex {
  const documents = passages.map((p) => tokenize(p.text));
  const vocabulary = new Map<string, number>();
  for (const doc of documents) {
    for (const token of doc) if (!vocabulary.has(token)) vocabulary.set(token, vocabulary.size);
  }
  const documentFrequency = new Array<number>(vocabulary.size).fill(0);
  for (const doc of documents) {
    for (const token of new Set(doc)) documentFrequency[vocabulary.get(token)!] += 1;
  }
  const ids = passages.map((p) => p.id);
  const averageLength = documents.reduce((s, d) => s + d.length, 0) / Math.max(documents.length, 1);

  // Passage-by-term matrix of TF-IDF weights, then its top "topics" via SVD.
  const shell = { ids, documentFrequency };
  const matrix = documents.map((doc) => {
    const row = new Map<number, number>();
    for (const token of doc) {
      const term = vocabulary.get(token)!;
      row.set(term, (row.get(term) ?? 0) + 1);
    }
    for (const [term, count] of row) row.set(term, (1 + Math.log(count)) * idfOf(shell, term));
    return row;
  });
  const gram = matrix.map((a) =>
    matrix.map((b) => {
      let dot = 0;
      for (const [term, value] of a) dot += value * (b.get(term) ?? 0);
      return dot;
    }),
  );
  const { values, vectors } = symmetricEigen(gram);
  const order = values
    .map((value, i) => ({ value, i }))
    .filter(({ value }) => value > 1e-9)
    .sort((a, b) => b.value - a.value)
    .slice(0, dimensions);

  const documentVectors = passages.map((_, d) =>
    order.map(({ value, i }) => vectors[d][i] * Math.sqrt(value)),
  );
  const termProjection = order.map(({ value, i }) => {
    const column = new Array<number>(vocabulary.size).fill(0);
    matrix.forEach((row, d) => {
      for (const [term, weight] of row) column[term] += (weight * vectors[d][i]) / Math.sqrt(value);
    });
    return column;
  });

  return {
    ids,
    documents,
    vocabulary,
    documentFrequency,
    averageLength,
    lsa: { documentVectors, termProjection },
  };
}

const descending = (a: Ranked, b: Ranked) => b.score - a.score || a.id.localeCompare(b.id);

/** Passages with a score above zero, best first. */
export function keywordSearch(index: SearchIndex, query: string): Ranked[] {
  const terms = [...new Set(tokenize(query))].filter((t) => index.vocabulary.has(t));
  return index.documents
    .map((doc, d) => {
      let score = 0;
      for (const token of terms) {
        const count = doc.filter((t) => t === token).length;
        if (count === 0) continue;
        const lengthNorm = 1 - BM25_B + (BM25_B * doc.length) / index.averageLength;
        score +=
          (idfOf(index, index.vocabulary.get(token)!) * count * (BM25_K1 + 1)) /
          (count + BM25_K1 * lengthNorm);
      }
      return { id: index.ids[d], score };
    })
    .filter((r) => r.score > 0)
    .sort(descending);
}

/** Passages with positive cosine similarity in topic space, best first. */
export function semanticSearch(index: SearchIndex, query: string): Ranked[] {
  const counts = new Map<number, number>();
  for (const token of tokenize(query)) {
    const term = index.vocabulary.get(token);
    if (term !== undefined) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const queryVector = index.lsa.termProjection.map((column) => {
    let total = 0;
    for (const [term, count] of counts) {
      total += (1 + Math.log(count)) * idfOf(index, term) * column[term];
    }
    return total;
  });
  const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  const queryNorm = norm(queryVector);
  if (queryNorm === 0) return [];

  return index.lsa.documentVectors
    .map((vector, d) => {
      const dot = vector.reduce((s, x, i) => s + x * queryVector[i], 0);
      return { id: index.ids[d], score: dot / (norm(vector) * queryNorm || 1) };
    })
    .filter((r) => r.score > 0)
    .sort(descending);
}

export const RRF_K = 60;

/**
 * Reciprocal Rank Fusion: each list gives a passage 1 / (RRF_K + its rank). Using ranks
 * avoids comparing BM25 scores with cosine scores, which are on different scales.
 */
export function reciprocalRankFusion(lists: readonly Ranked[][], k = RRF_K): Ranked[] {
  const totals = new Map<string, number>();
  for (const list of lists) {
    list.forEach(({ id }, position) => {
      totals.set(id, (totals.get(id) ?? 0) + 1 / (k + position + 1));
    });
  }
  return [...totals.entries()].map(([id, score]) => ({ id, score })).sort(descending);
}

/** Share of the relevant passages found in the top k results. */
export function recallAtK(ranked: readonly string[], relevant: readonly string[], k: number): number {
  if (relevant.length === 0) throw new Error("recallAtK needs at least one relevant passage");
  const top = new Set(ranked.slice(0, k));
  return relevant.filter((id) => top.has(id)).length / relevant.length;
}
