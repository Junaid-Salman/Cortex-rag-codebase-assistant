import { buildRetriever } from "../src/retrieval/buildRetriever.js";
import { getPrompts } from "../src/chain/prompts.js";
import { withLocation } from "../src/chain/citations.js";

const { documentPrompt } = getPrompts("cited");
for (const q of process.argv.slice(2)) {
  const docs = (await buildRetriever("social-network", { mode: "hybrid", k: 5 }).invoke(q)).map(withLocation);
  console.log(`\n=== ${q}`);
  for (const d of docs) {
    const text = await documentPrompt.invoke({ ...d.metadata, page_content: d.pageContent });
    console.log(text.toString().split("\n").slice(0, 2).join("\n"), "\n---");
  }
}
