import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { GraphRetriever } from "../src/retrieval/graphRetriever.js";

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const r = new GraphRetriever({ repoName: "social-network", client });
for (const q of process.argv.slice(2)) {
  console.log("\n=== Q:", q);
  const docs = await r.invoke(q);
  if (!docs.length) console.log("(no graph docs)");
  docs.forEach((d) => console.log("---", d.metadata.source, "\n" + d.pageContent));
}
