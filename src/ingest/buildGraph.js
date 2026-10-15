import fs from "fs";
import path from "path";
import { extractGraph } from "./extractGraph.js";

/**
 * Extract function/reference/import graph data for every file in a repo and
 * store it in Supabase, tagged with repoName (same delete-before-reindex
 * pattern as buildIndex.js's chunk indexing, so re-indexing doesn't
 * accumulate stale rows).
 *
 * @param {string[]} files - absolute file paths (from loadRepo)
 * @param {string} repoDir - path the repo was loaded from, for relative source paths
 * @param {string} repoName - label to tag rows with
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 */
export async function buildGraph(files, repoDir, repoName, client) {
  const rows = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const source = path.relative(repoDir, file);
    const { functions, references, imports } = extractGraph(content, file);

    for (const fn of functions) {
      rows.push({
        repo: repoName,
        kind: "function",
        name: fn.name,
        scope: null,
        file: source,
        start_line: fn.startLine,
        end_line: fn.endLine,
        data: null,
      });
    }

    for (const ref of references) {
      rows.push({
        repo: repoName,
        kind: "reference",
        name: ref.name,
        scope: ref.scope,
        file: source,
        start_line: ref.line,
        end_line: ref.line,
        data: null,
      });
    }

    for (const imp of imports) {
      rows.push({
        repo: repoName,
        kind: "import",
        name: null,
        scope: null,
        file: source,
        start_line: null,
        end_line: null,
        data: { source: imp.source },
      });
    }
  }

  const { error: deleteError } = await client
    .from("code_graph")
    .delete()
    .eq("repo", repoName);
  if (deleteError) {
    throw new Error(`Failed to clear existing graph rows for repo "${repoName}": ${deleteError.message}`);
  }

  if (rows.length > 0) {
    const { error: insertError } = await client.from("code_graph").insert(rows);
    if (insertError) {
      throw new Error(`Failed to insert graph rows for repo "${repoName}": ${insertError.message}`);
    }
  }

  return rows.length;
}
