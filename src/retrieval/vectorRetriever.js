import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { OllamaEmbeddings } from "@langchain/ollama";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

/**
 * Supabase client shared by the retrievers.
 */
export function createSupabaseClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

/**
 * Vector (similarity-search) retriever restricted to one indexed repo tag.
 *
 * @param {string} repoName - metadata.repo value the chunks were indexed under
 * @param {{ k?: number, client?: import("@supabase/supabase-js").SupabaseClient }} [options]
 */
export function buildVectorRetriever(repoName, { k = 5, client = createSupabaseClient() } = {}) {
  const embeddings = new OllamaEmbeddings({ model: "nomic-embed-text" });
  const vectorStore = new SupabaseVectorStore(embeddings, {
    client,
    tableName: "code_chunks",
    queryName: "match_code_chunks",
  });
  return vectorStore.asRetriever({ k, filter: { repo: repoName } });
}
