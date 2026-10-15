/**
 * Retrieval metrics for the evaluation harness. Pure functions, no I/O.
 *
 * "Files" are repo-relative paths (the same strings as chunk metadata.source).
 */

/**
 * Collapse retrieved documents into an ordered list of distinct files.
 * Graph documents list every file they surface in metadata.files; chunk
 * documents only have metadata.source.
 *
 * @param {{ metadata: { source?: string, files?: string[] } }[]} docs - ranked, best first
 * @returns {string[]}
 */
export function distinctFiles(docs) {
  const seen = new Set();
  const files = [];
  for (const doc of docs) {
    const candidates = doc.metadata?.files ?? (doc.metadata?.source ? [doc.metadata.source] : []);
    for (const f of candidates) {
      if (!seen.has(f)) {
        seen.add(f);
        files.push(f);
      }
    }
  }
  return files;
}

/**
 * Score one question's retrieved files against its expected files.
 *
 * @param {string[]} retrievedFiles - ordered, distinct
 * @param {string[]} expectedFiles
 * @returns {{ hit: number, recall: number, precision: number, rr: number }}
 */
export function scoreQuestion(retrievedFiles, expectedFiles) {
  const expected = new Set(expectedFiles);
  const found = retrievedFiles.filter((f) => expected.has(f));
  const firstRank = retrievedFiles.findIndex((f) => expected.has(f));

  return {
    hit: found.length > 0 ? 1 : 0,
    recall: expected.size === 0 ? 0 : found.length / expected.size,
    precision: retrievedFiles.length === 0 ? 0 : found.length / retrievedFiles.length,
    rr: firstRank === -1 ? 0 : 1 / (firstRank + 1),
  };
}

/**
 * Average per-question scores.
 *
 * @param {{ hit: number, recall: number, precision: number, rr: number }[]} scores
 */
export function aggregate(scores) {
  const n = scores.length;
  const mean = (key) => (n === 0 ? 0 : scores.reduce((sum, s) => sum + s[key], 0) / n);
  return { n, hit: mean("hit"), recall: mean("recall"), precision: mean("precision"), mrr: mean("rr") };
}
