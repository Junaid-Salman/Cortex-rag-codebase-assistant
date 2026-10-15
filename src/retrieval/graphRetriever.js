import { BaseRetriever } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";

const MIN_TOKEN_LENGTH = 3;
const STOPWORDS = new Set([
  "the", "and", "for", "with", "what", "does", "this", "that", "from",
  "have", "has", "how", "who", "which", "when", "where", "why", "are",
  "was", "were", "call", "calls", "called", "calling", "function",
  "codebase", "file", "does",
]);

// Explicit file paths in the question ("routes/followRoutes.js"), which the
// identifier tokenizer below would otherwise shred into "routes", "js", etc.
function extractPaths(query) {
  return query.match(/[\w.-]+(?:\/[\w.-]+)+|[\w-]+\.(?:js|jsx|ts|tsx|mjs|cjs)\b/g) ?? [];
}

function extractTokens(query) {
  const matches = query.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? [];
  return [...new Set(matches.filter(
    (t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t.toLowerCase()),
  ))];
}

/**
 * Retrieves structural context (who defines/calls/imports what) from the
 * code_graph table, populated by buildGraph.js during indexing. Complements
 * the vector retriever, which has no notion of call/import relationships
 * between chunks.
 */
export class GraphRetriever extends BaseRetriever {
  static lc_name() {
    return "GraphRetriever";
  }

  lc_namespace = ["cortex", "retrievers", "graph"];

  constructor({ repoName, client, ...rest }) {
    super(rest);
    this.repoName = repoName;
    this.client = client;
  }

  async _getRelevantDocuments(query) {
    const paths = extractPaths(query).map((p) => p.toLowerCase());
    const tokens = extractTokens(query);
    if (tokens.length === 0 && paths.length === 0) return [];

    const { data: rows, error } = await this.client
      .from("code_graph")
      .select("*")
      .eq("repo", this.repoName);
    if (error) throw new Error(`GraphRetriever: failed to fetch graph rows: ${error.message}`);
    if (!rows || rows.length === 0) return [];

    const docs = [];
    const seen = new Set();

    for (const token of tokens) {
      const lower = token.toLowerCase();

      // Function/method name match: describe its definition + every place
      // it's referenced (including bare-identifier route/middleware wiring).
      const defRows = rows.filter((r) => r.kind === "function" && r.name?.toLowerCase() === lower);
      for (const def of defRows) {
        const key = `fn:${def.file}:${def.name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const refRows = rows.filter((r) => r.kind === "reference" && r.name?.toLowerCase() === lower);
        const refLines = refRows.length
          ? refRows.map((r) => `- ${r.file} (${r.scope === "<module>" ? "module scope" : `inside ${r.scope}()`}, line ${r.start_line})`).join("\n")
          : "(no references found elsewhere in the indexed repo)";

        docs.push(new Document({
          pageContent: `Function \`${def.name}\` is defined in ${def.file} (lines ${def.start_line}-${def.end_line}).\nReferenced/called at:\n${refLines}`,
          // `source` is the definition file; `files` also lists every file that
          // references it, so evaluation can tell which files this doc surfaces.
          metadata: {
            source: def.file,
            files: [...new Set([def.file, ...refRows.map((r) => r.file)])],
            startLine: def.start_line,
            endLine: def.end_line,
          },
        }));
      }

      // File path match: describe its imports + who imports it back.
      // Exact path (or path suffix) or exact basename only -- substring
      // matching made "routes" or "user" match every file in the repo.
      const matchedFiles = [...new Set(rows.filter((r) => {
        if (!r.file) return false;
        const f = r.file.toLowerCase();
        const base = f.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
        return base === lower || paths.some((p) => f === p || f.endsWith(`/${p}`));
      }).map((r) => r.file))];
      for (const file of matchedFiles) {
        const key = `file:${file}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const importRows = rows.filter((r) => r.kind === "import" && r.file === file);
        const imports = importRows.length
          ? importRows.map((r) => `- ${r.data?.source}`).join("\n")
          : "(no imports found)";

        const base = file.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
        const importedByRows = rows.filter(
          (r) => r.kind === "import" && r.file !== file && r.data?.source?.toLowerCase().includes(base.toLowerCase()),
        );
        const importedBy = importedByRows.length
          ? [...new Set(importedByRows.map((r) => r.file))].map((f) => `- ${f}`).join("\n")
          : "(no other indexed file imports it)";

        docs.push(new Document({
          pageContent: `File ${file} imports:\n${imports}\n\nFiles that import ${file}:\n${importedBy}`,
          metadata: {
            source: file,
            files: [...new Set([file, ...importedByRows.map((r) => r.file)])],
          },
        }));
      }
    }

    return docs;
  }
}
