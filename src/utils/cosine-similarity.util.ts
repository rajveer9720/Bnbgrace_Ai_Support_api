export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return 0;
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const score = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : 0;
}

export interface ScoredChunk<T> {
  chunk: T;
  score: number;
}

export function getTopMatches<T extends { embedding: number[] | null }>(
  queryEmbedding: number[],
  chunks: T[],
  topN = 5,
): ScoredChunk<T>[] {
  return chunks
    .filter(
      (chunk) =>
        Array.isArray(chunk.embedding) &&
        chunk.embedding.length === queryEmbedding.length &&
        chunk.embedding.length > 0,
    )
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding as number[]),
    }))
    .sort((a, b) => b.score - a.score)
    .filter(({ score }) => score > 0)
    .slice(0, topN);
}
