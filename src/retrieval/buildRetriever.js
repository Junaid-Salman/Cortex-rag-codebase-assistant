import { EnsembleRetriever } from "@langchain/classic/retrievers/ensemble";
import { buildVectorRetriever, createSupabaseClient } from "./vectorRetriever.js";
import { GraphRetriever } from "./graphRetriever.js";

/**
 * Build the retriever for a given mode, so the QA chain and the evaluation
 * harness exercise exactly the same retrieval code.
 *
 * @param {string} repoName
 * @param {{ mode?: "vector" | "graph" | "hybrid", k?: number }} [options]
 *   - vector: similarity search only
 *   - graph:  call/import graph lookup only (ablation)
 *   - hybrid: vector + graph via EnsembleRetriever (default)
 */
export function buildRetriever(repoName, { mode = "hybrid", k = 5 } = {}) {
  const client = createSupabaseClient();

  if (mode === "vector") return buildVectorRetriever(repoName, { k, client });
  if (mode === "graph") return new GraphRetriever({ repoName, client });
  if (mode === "hybrid") {
    return new EnsembleRetriever({
      retrievers: [buildVectorRetriever(repoName, { k, client }), new GraphRetriever({ repoName, client })],
      weights: [0.5, 0.5],
    });
  }
  throw new Error(`Unknown retriever mode "${mode}" (expected vector | graph | hybrid)`);
}
