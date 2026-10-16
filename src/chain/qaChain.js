import "dotenv/config";
import { ChatOllama } from "@langchain/ollama";
import { RunnableLambda } from "@langchain/core/runnables";
import { createStuffDocumentsChain } from "@langchain/classic/chains/combine_documents";
import { createRetrievalChain } from "@langchain/classic/chains/retrieval";
import { buildRetriever } from "../retrieval/buildRetriever.js";
import { getPrompts } from "./prompts.js";
import { withLocation } from "./citations.js";

/**
 * Ask a question against a previously indexed repo and also return the
 * retrieved context, so callers (e.g. the answer review) can check the
 * answer against exactly what the model was shown.
 *
 * @param {string} question - the natural-language question
 * @param {string} repoName - which repo's chunks to search (matches metadata.repo from indexing)
 * @param {{ promptVersion?: "legacy" | "cited" }} [options]
 * @returns {Promise<{ answer: string, context: import("@langchain/core/documents").Document[] }>}
 */
export async function askQuestionDetailed(question, repoName, { promptVersion = "cited" } = {}) {
  // Vector search + graph lookup (see buildRetriever for the pieces), then
  // label each document with its line range for the citation prompt.
  const retriever = buildRetriever(repoName, { mode: "hybrid", k: 5 }).pipe(
    RunnableLambda.from((docs) => docs.map(withLocation)),
  );

  const model = new ChatOllama({ model: "llama3.1:8b" });
  const { prompt, documentPrompt } = getPrompts(promptVersion);

  const combineDocsChain = await createStuffDocumentsChain({
    llm: model,
    prompt,
    documentPrompt,
  });
  const chain = await createRetrievalChain({ retriever, combineDocsChain });

  const result = await chain.invoke({ input: question });
  return { answer: result.answer, context: result.context };
}

/**
 * Ask a question and return just the answer text (used by the CLI).
 *
 * @param {string} question
 * @param {string} repoName
 */
export async function askQuestion(question, repoName) {
  const { answer } = await askQuestionDetailed(question, repoName);
  return answer;
}
