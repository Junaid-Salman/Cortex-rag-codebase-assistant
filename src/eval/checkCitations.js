import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadRepo } from "../ingest/loadRepo.js";
import { analyzeAnswer } from "./citationCheck.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Usage: node src/eval/checkCitations.js [answers.json ...]
 * Defaults to the legacy and cited answer files. Prints a per-answer table and
 * a totals row per file; add --json to dump the raw analysis.
 */
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const fileArgs = args.filter((a) => !a.startsWith("--"));
const answerFiles = fileArgs.length
  ? fileArgs.map((f) => path.resolve(f))
  : ["legacy", "cited"].map((v) => path.join(here, "answers", `answers-${v}.json`)).filter(fs.existsSync);

const dataset = JSON.parse(fs.readFileSync(path.join(here, "dataset.json"), "utf-8"));
const repoFiles = (await loadRepo(dataset.sourceRepoPath)).map((f) => path.relative(dataset.sourceRepoPath, f));

const pct = (n, d) => (d === 0 ? "n/a" : `${Math.round((100 * n) / d)}%`);
const all = {};

for (const file of answerFiles) {
  const saved = JSON.parse(fs.readFileSync(file, "utf-8"));
  const rows = saved.answers.map((a) => ({
    id: a.id,
    seconds: a.seconds,
    ...analyzeAnswer({ answer: a.answer, context: a.context, repoFiles, expectedFiles: a.expectedFiles }),
  }));
  all[saved.promptVersion] = rows;
  if (asJson) continue;

  console.log(`\n## prompt: ${saved.promptVersion} (${rows.length} answers)\n`);
  console.log("| id | files cited | invented paths | ungrounded files | line cites | invalid lines | expected files cited |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of rows) {
    console.log(
      `| ${r.id} | ${r.files.length} | ${r.nonexistentFiles.length ? r.nonexistentFiles.join(", ") : 0} | ${r.ungroundedFiles.length} | ${r.lineCites.length + r.unattributedLineCites} | ${r.invalidLineCites.length + r.unattributedLineCites} | ${r.expectedFilesCited}/${r.expectedFilesTotal} |`,
    );
  }
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const filesCited = sum((r) => r.files.length);
  const lineCites = sum((r) => r.lineCites.length + r.unattributedLineCites);
  const lineBad = sum((r) => r.invalidLineCites.length + r.unattributedLineCites);
  console.log(
    `| **total** | ${filesCited} | ${sum((r) => r.nonexistentFiles.length)} (${pct(sum((r) => r.nonexistentFiles.length), filesCited)}) | ${sum((r) => r.ungroundedFiles.length)} | ${lineCites} | ${lineBad} (${pct(lineBad, lineCites)}) | ${sum((r) => r.expectedFilesCited)}/${sum((r) => r.expectedFilesTotal)} (${pct(sum((r) => r.expectedFilesCited), sum((r) => r.expectedFilesTotal))}) |`,
  );
}
if (asJson) console.log(JSON.stringify(all, null, 2));
