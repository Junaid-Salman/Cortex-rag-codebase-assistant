import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { OllamaEmbeddings, ChatOllama } from "@langchain/ollama";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "@langchain/classic/chains/combine_documents";
import { createRetrievalChain } from "@langchain/classic/chains/retrieval";

/**
 * Ask a question against a previously indexed repo.
 *
 * @param {string} question - the natural-language question
 * @param {string} repoName - which repo's chunks to search (matches metadata.repo from indexing)
 */
export async function askQuestion(question, repoName) {
  const embeddings = new OllamaEmbeddings({ model: "nomic-embed-text" });
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  );

  const vectorStore = new SupabaseVectorStore(embeddings, {
    client,
    tableName: "code_chunks",
    queryName: "match_code_chunks",
  });

  // Only retrieve chunks belonging to this repo
  const retriever = vectorStore.asRetriever({
    k: 5,
    filter: { repo: repoName },
  });

  const model = new ChatOllama({ model: "llama3.1:8b" });

  const prompt = ChatPromptTemplate.fromTemplate(`
You are a helpful assistant answering questions about a codebase.
Use only the code context below to answer. If the answer isn't in the context, say so.
Cite the file path for each claim you make.

Context:
{context}

Question: {input}
`);

  const combineDocsChain = await createStuffDocumentsChain({
    llm: model,
    prompt,
  });
  const chain = await createRetrievalChain({ retriever, combineDocsChain });

  const result = await chain.invoke({ input: question });
  return result.answer;
}
