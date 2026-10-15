import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { OllamaEmbeddings } from "@langchain/ollama";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { chunkCode } from "./chunkCode.js";
import { buildGraph } from "./buildGraph.js";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import fs from "fs";
import path from "path";
import { loadRepo } from "./loadRepo.js";

const NAIVE_CHUNK_SIZE = 1000;
const NAIVE_CHUNK_OVERLAP = 100;

/**
 * Character-based baseline chunker, kept so the evaluation can compare it
 * against AST-aware chunking. Returns the same shape as chunkCode().
 */
async function chunkNaive(content) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: NAIVE_CHUNK_SIZE,
    chunkOverlap: NAIVE_CHUNK_OVERLAP,
  });
  const docs = await splitter.createDocuments([content]);
  return docs.map((d) => ({
    text: d.pageContent,
    type: "naive",
    startLine: d.metadata.loc.lines.from,
    endLine: d.metadata.loc.lines.to,
  }));
}

/**
 * Chunk and embed all files in a repo, then store them in Supabase.
 *
 * @param {string} repoDir - path to the repo to index
 * @param {string} repoName - a label to tag chunks with (for multi-repo filtering later)
 * @param {{ chunker?: "ast" | "naive" }} [options] - "ast" (default) uses tree-sitter
 *   chunking and also builds the code graph; "naive" uses character splitting and
 *   skips the graph (it exists only as an evaluation baseline).
 */
export async function buildIndex(repoDir, repoName, { chunker = "ast" } = {}) {
  if (chunker !== "ast" && chunker !== "naive") {
    throw new Error(`Unknown chunker "${chunker}" (expected "ast" or "naive")`);
  }

  const files = await loadRepo(repoDir);
  console.log(`Found ${files.length} files in ${repoDir}`);

  const docs = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const source = path.relative(repoDir, file);
    const chunks = chunker === "naive" ? await chunkNaive(content) : chunkCode(content, file);

    chunks.forEach((chunk, i) => {
      docs.push(
        new Document({
          pageContent: chunk.text,
          metadata: {
            source,
            repo: repoName,
            chunkIndex: i,
            nodeType: chunk.type,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
          },
        }),
      );
    });
  }

  console.log(
    `Split into ${docs.length} chunks. Embedding + uploading to Supabase...`,
  );

  const embeddings = new OllamaEmbeddings({ model: "nomic-embed-text" });
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  // Clear any existing chunks under this repo tag first, so re-indexing
  // doesn't silently accumulate stale/duplicate rows on top of old ones.
  const { error: deleteError } = await client
    .from("code_chunks")
    .delete()
    .eq("metadata->>repo", repoName);
  if (deleteError) {
    throw new Error(`Failed to clear existing chunks for repo "${repoName}": ${deleteError.message}`);
  }

  await SupabaseVectorStore.fromDocuments(docs, embeddings, {
    client,
    tableName: "code_chunks",
    queryName: "match_code_chunks",
  });

  console.log(
    `✅ Indexed ${docs.length} chunks from ${files.length} files into Supabase.`,
  );

  if (chunker === "naive") {
    console.log("Skipping code graph (naive chunker is a baseline for evaluation only).");
    return;
  }

  const graphRowCount = await buildGraph(files, repoDir, repoName, client);
  console.log(`✅ Indexed ${graphRowCount} graph rows (functions/references/imports) into Supabase.`);
}
