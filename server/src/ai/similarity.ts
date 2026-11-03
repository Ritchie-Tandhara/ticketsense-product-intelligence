// Deterministic ticket-similarity engine for Issue Genome.
//
// This is explicitly a "similarity score", not an AI "confidence" score — it
// is a plain Jaccard coefficient over token bigram sets. No machine learning,
// no external call, fully reproducible. Documented in detail in
// docs/product-intelligence.md ("Similarity & Clustering Formula").
//
// Formula:
//   1. Normalize text: lowercase, strip punctuation, collapse whitespace.
//   2. Tokenize on whitespace, drop stopwords and tokens < 3 chars.
//   3. Build the set of word bigrams (consecutive token pairs) from the
//      remaining token sequence. Bigrams capture phrase-level structure
//      ("otp delivery", "delivery failed") that single-token overlap misses.
//   4. similarity(A, B) = |bigrams(A) ∩ bigrams(B)| / |bigrams(A) ∪ bigrams(B)|
//      (Jaccard index on the bigram sets), falling back to unigram Jaccard
//      if either ticket produces fewer than 2 tokens (too short for bigrams).
//   5. Two tickets are "related" if similarity >= SIMILARITY_THRESHOLD.
//
// Clustering: simple greedy union-find over all pairs above the threshold.
// This is intentionally simple (no ML, no embeddings) and documented as such.

export const SIMILARITY_THRESHOLD = 0.22;
export const MIN_CLUSTER_SIZE = 3;

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "to", "of", "and", "or", "but",
  "in", "on", "at", "for", "with", "about", "as", "by", "this", "that", "these", "those", "it", "its",
  "i", "we", "you", "they", "he", "she", "my", "our", "your", "their", "me", "us", "them",
  "not", "no", "so", "if", "than", "then", "when", "while", "all", "any", "can", "could", "would",
  "should", "will", "just", "please", "have", "has", "had", "do", "does", "did", "get", "got",
  "from", "up", "out", "into", "over", "again", "please", "also", "very", "really", "im", "ive",
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function bigrams(tokens: string[]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    set.add(`${tokens[i]}_${tokens[i + 1]}`);
  }
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Computes the documented similarity score between two ticket texts (subject+description). */
export function similarityScore(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (tokensA.length < 2 || tokensB.length < 2) {
    return jaccard(new Set(tokensA), new Set(tokensB));
  }
  return jaccard(bigrams(tokensA), bigrams(tokensB));
}

/** Extracts the top N most frequent significant tokens shared across a group of texts ("common symptoms"). */
export function commonSymptoms(texts: string[], topN = 8): string[] {
  const freq = new Map<string, number>();
  for (const text of texts) {
    const seen = new Set(tokenize(text));
    for (const token of seen) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .filter(([, count]) => count >= Math.max(2, Math.ceil(texts.length * 0.3)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([token]) => token);
}

export interface ClusterableTicket {
  id: string;
  text: string;
}

export interface Cluster {
  ticketIds: string[];
  avgSimilarity: number;
  pairs: { a: string; b: string; score: number }[];
}

/**
 * Greedy union-find clustering: any two tickets with similarity >= threshold
 * are unioned into the same cluster. Deterministic given the same input order
 * (tickets are always processed in a stable id-sorted order before clustering).
 */
export function clusterTickets(tickets: ClusterableTicket[], threshold = SIMILARITY_THRESHOLD): Cluster[] {
  const sorted = [...tickets].sort((a, b) => a.id.localeCompare(b.id));
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (x: string, y: string) => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };

  const pairScores: { a: string; b: string; score: number }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    find(sorted[i].id);
    for (let j = i + 1; j < sorted.length; j++) {
      const score = similarityScore(sorted[i].text, sorted[j].text);
      if (score >= threshold) {
        union(sorted[i].id, sorted[j].id);
        pairScores.push({ a: sorted[i].id, b: sorted[j].id, score });
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const t of sorted) {
    const root = find(t.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(t.id);
  }

  const clusters: Cluster[] = [];
  for (const ticketIds of groups.values()) {
    if (ticketIds.length < MIN_CLUSTER_SIZE) continue;
    const idSet = new Set(ticketIds);
    const pairs = pairScores.filter((p) => idSet.has(p.a) && idSet.has(p.b));
    const avgSimilarity = pairs.length > 0 ? pairs.reduce((s, p) => s + p.score, 0) / pairs.length : 0;
    clusters.push({ ticketIds, avgSimilarity, pairs });
  }
  return clusters.sort((a, b) => b.ticketIds.length - a.ticketIds.length);
}
