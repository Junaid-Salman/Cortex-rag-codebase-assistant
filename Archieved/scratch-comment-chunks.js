import { createSupabaseClient } from "../src/retrieval/vectorRetriever.js";
const client = createSupabaseClient();
for (const repo of ["social-network", "social-network-naive"]) {
  const { data } = await client.from("code_chunks").select("content, metadata").eq("metadata->>repo", repo);
  const commentOnly = data.filter((r) => r.content.trim().split("\n").every((l) => /^\s*(\/\/|\/\*|\*|$)/.test(l)));
  const tiny = data.filter((r) => r.content.trim().length < 60);
  console.log(`${repo}: ${data.length} chunks | comment-only: ${commentOnly.length} | under 60 chars: ${tiny.length}`);
  if (repo === "social-network") commentOnly.slice(0, 4).forEach((r) => console.log("   ", r.metadata.source, `${r.metadata.startLine}-${r.metadata.endLine}`, JSON.stringify(r.content.trim().slice(0, 50))));
}
