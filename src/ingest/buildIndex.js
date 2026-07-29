import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { OllamaEmbeddings } from "@langchain/ollama";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { chunkCode } from "./chunkCode.js";
import { Document } from "@langchain/core/documents";
import fs from "fs";
import path from "path";
import { loadRepo } from "./loadRepo.js";

/**
 * Chunk and embed all files in a repo, then store them in Supabase.
 *
 * @param {string} repoDir - path to the repo to index
 * @param {string} repoName - a label to tag chunks with (for multi-repo filtering later)
 */
export async function buildIndex(repoDir, repoName) {
  const files = await loadRepo(repoDir);
  console.log(`Found ${files.length} files in ${repoDir}`);

  const docs = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const source = path.relative(repoDir, file);
    const chunks = chunkCode(content, file);

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
}
