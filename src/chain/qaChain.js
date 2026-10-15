import "dotenv/config";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "@langchain/classic/chains/combine_documents";
import { createRetrievalChain } from "@langchain/classic/chains/retrieval";
import { buildRetriever } from "../retrieval/buildRetriever.js";

/**
 * Ask a question against a previously indexed repo.
 *
 * @param {string} question - the natural-language question
 * @param {string} repoName - which repo's chunks to search (matches metadata.repo from indexing)
 */
export async function askQuestion(question, repoName) {
  // Vector search + graph lookup (see buildRetriever for the pieces).
  const retriever = buildRetriever(repoName, { mode: "hybrid", k: 5 });

  const model = new ChatOllama({ model: "llama3.1:8b" });

  const prompt = ChatPromptTemplate.fromTemplate(`
You are a helpful assistant answering questions about a codebase.
Use only the code context below to answer. If the answer isn't in the context, say so.
Cite the file path for each claim you make.

Context:
{context}

Question: {input}
`);

  // Without this, createStuffDocumentsChain only stuffs each chunk's
  // pageContent into {context} — metadata.source never reaches the model,
  // so "cite the file path" above would just be guessed from convention.
  const documentPrompt = PromptTemplate.fromTemplate(
    "File: {source}\n{page_content}",
  );

  const combineDocsChain = await createStuffDocumentsChain({
    llm: model,
    prompt,
    documentPrompt,
  });
  const chain = await createRetrievalChain({ retriever, combineDocsChain });

  const result = await chain.invoke({ input: question });
  return result.answer;
}
