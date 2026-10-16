import fs from "fs";
import { buildRetriever } from "../src/retrieval/buildRetriever.js";
const q = JSON.parse(fs.readFileSync(new URL("../src/eval/dataset.json", import.meta.url))).questions.find((x) => x.id === "c01").question;
for (const mode of ["vector", "hybrid"]) {
  console.log(`\n[${mode}] ${q}`);
  (await buildRetriever("social-network", { mode, k: 5 }).invoke(q)).forEach((d) =>
    console.log("  -", d.metadata.source, d.metadata.startLine ?? "", d.metadata.endLine ?? "", d.metadata.files ? "(graph)" : "", JSON.stringify(d.pageContent.slice(0, 40))));
}
