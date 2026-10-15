import { Agent, setGlobalDispatcher } from "undici";
import { buildIndex } from "./ingest/buildIndex.js";
import { askQuestion } from "./chain/qaChain.js";

// Node's default fetch dispatcher gives up if a response's headers haven't
// arrived within 5 minutes. Local Ollama generation on CPU can legitimately
// take longer than that under load, so disable the timeout rather than have
// slow-but-working requests killed mid-flight.
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));

const [, , cmd, ...args] = process.argv;

if (cmd === "index") {
  const flagIdx = args.indexOf("--chunker");
  const chunker = flagIdx === -1 ? "ast" : args[flagIdx + 1];
  const positional = flagIdx === -1 ? args : args.filter((_, i) => i !== flagIdx && i !== flagIdx + 1);
  const [repoDir, repoName] = positional;
  if (!repoDir || !repoName || (chunker !== "ast" && chunker !== "naive")) {
    console.error("Usage: node src/cli.js index <repoPath> <repoName> [--chunker ast|naive]");
    process.exit(1);
  }
  await buildIndex(repoDir, repoName, { chunker });
} else if (cmd === "ask") {
  const [repoName, ...questionParts] = args;
  const question = questionParts.join(" ");
  if (!repoName || !question) {
    console.error('Usage: node src/cli.js ask <repoName> "<question>"');
    process.exit(1);
  }
  const answer = await askQuestion(question, repoName);
  console.log("\n" + answer + "\n");
} else {
  console.error(`Unknown command: ${cmd}`);
}