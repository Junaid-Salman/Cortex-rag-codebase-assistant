import { buildRetriever } from "../src/retrieval/buildRetriever.js";
import { createSupabaseClient } from "../src/retrieval/vectorRetriever.js";

const client = createSupabaseClient();
for (const repo of ["social-network-naive", "social-network"]) {
  const { count } = await client.from("code_chunks").select("*", { count: "exact", head: true }).eq("metadata->>repo", repo);
  const { count: g } = await client.from("code_graph").select("*", { count: "exact", head: true }).eq("repo", repo);
  console.log(`${repo}: ${count} chunks, ${g} graph rows`);
}

const q = "What calls protect?";
for (const [repo, mode] of [["social-network-naive", "vector"], ["social-network", "vector"], ["social-network", "graph"], ["social-network", "hybrid"]]) {
  const docs = await buildRetriever(repo, { mode, k: 5 }).invoke(q);
  console.log(`\n${repo} / ${mode}: ${docs.length} docs`);
  docs.forEach((d) => console.log(" -", d.metadata.source, d.metadata.startLine ?? "", d.metadata.endLine ?? "", d.metadata.files ? `files=[${d.metadata.files.join(",")}]` : ""));
}
