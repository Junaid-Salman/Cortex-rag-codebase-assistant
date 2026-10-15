import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { OllamaEmbeddings } from "@langchain/ollama";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const vs = new SupabaseVectorStore(new OllamaEmbeddings({ model: "nomic-embed-text" }), { client, tableName: "code_chunks", queryName: "match_code_chunks" });
const r = vs.asRetriever({ k: 5, filter: { repo: "social-network" } });
for (const q of process.argv.slice(2)) {
  console.log("\n=== Q:", q);
  (await r.invoke(q)).forEach((d) => console.log(" -", d.metadata.source));
}
