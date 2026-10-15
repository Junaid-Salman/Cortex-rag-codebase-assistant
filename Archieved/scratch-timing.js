import fs from "fs";
import { Agent, setGlobalDispatcher } from "undici";
import { buildRetriever } from "../src/retrieval/buildRetriever.js";
import { askQuestion } from "../src/chain/qaChain.js";

setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));

const ids = (process.argv[2] ?? "s02,s03,t01,t03,c01").split(",");
const dataset = JSON.parse(fs.readFileSync(new URL("../src/eval/dataset.json", import.meta.url)));
const retriever = buildRetriever("social-network", { mode: "hybrid", k: 5 });

const rows = [];
for (const id of ids) {
  const { question } = dataset.questions.find((q) => q.id === id);

  let t = performance.now();
  await retriever.invoke(question);
  const retrievalS = (performance.now() - t) / 1000;

  t = performance.now();
  const answer = await askQuestion(question, "social-network"); // retrieval + generation
  const totalS = (performance.now() - t) / 1000;

  rows.push({ id, retrievalS, totalS, generationS: totalS - retrievalS, answerChars: answer.length });
  console.log(id, `retrieval ${retrievalS.toFixed(1)}s | total ${totalS.toFixed(1)}s | answer ${answer.length} chars`);
}
const avg = (k) => (rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(1);
console.log(`\nAVG over ${rows.length}: retrieval ${avg("retrievalS")}s | generation ${avg("generationS")}s | total ${avg("totalS")}s`);
