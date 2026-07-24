import { buildIndex } from "./ingest/buildIndex.js";
import { askQuestion } from "./chain/qaChain.js";

const [, , cmd, ...args] = process.argv;

if (cmd === "index") {
  const [repoDir, repoName] = args;
  if (!repoDir || !repoName) {
    console.error("Usage: node src/cli.js index <repoPath> <repoName>");
    process.exit(1);
  }
  await buildIndex(repoDir, repoName);
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