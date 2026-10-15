import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Agent, setGlobalDispatcher } from "undici";
import { buildRetriever } from "../retrieval/buildRetriever.js";
import { distinctFiles, scoreQuestion, aggregate } from "./metrics.js";

setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));

const here = path.dirname(fileURLToPath(import.meta.url));

// Each config = which indexed repo tag to search and which retriever mode.
//   naive  - character chunks, vector search only
//   ast    - AST chunks, vector search only
//   hybrid - AST chunks, vector + code graph (what `ask` uses)
//   graph  - code graph only (ablation)
function configs(repoBase) {
  return {
    naive: { repo: `${repoBase}-naive`, mode: "vector" },
    ast: { repo: repoBase, mode: "vector" },
    hybrid: { repo: repoBase, mode: "hybrid" },
    graph: { repo: repoBase, mode: "graph" },
  };
}

function parseArgs(argv) {
  const opts = {
    dataset: path.join(here, "dataset.json"),
    repo: "social-network",
    ks: [5, 10],
    configs: ["naive", "ast", "hybrid", "graph"],
    out: null,
    allowDraft: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dataset") opts.dataset = path.resolve(argv[++i]);
    else if (a === "--repo") opts.repo = argv[++i];
    else if (a === "--k") opts.ks = argv[++i].split(",").map(Number);
    else if (a === "--configs") opts.configs = argv[++i].split(",");
    else if (a === "--out") opts.out = path.resolve(argv[++i]);
    else if (a === "--allow-draft") opts.allowDraft = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

const pct = (x) => `${(x * 100).toFixed(0)}%`;

function table(title, rowsByConfig, configNames) {
  const lines = [`\n${title}`, "", "| config | n | hit | recall | precision | MRR |", "|---|---|---|---|---|---|"];
  for (const name of configNames) {
    const a = rowsByConfig[name];
    lines.push(`| ${name} | ${a.n} | ${pct(a.hit)} | ${pct(a.recall)} | ${pct(a.precision)} | ${a.mrr.toFixed(2)} |`);
  }
  return lines.join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dataset = JSON.parse(fs.readFileSync(opts.dataset, "utf-8"));

  if (dataset.status !== "reviewed" && !opts.allowDraft) {
    throw new Error(
      `Dataset status is "${dataset.status}", not "reviewed". Ground truth must be human-reviewed before ` +
        `official results are recorded. Pass --allow-draft for a smoke test only.`,
    );
  }

  const all = configs(opts.repo);
  for (const name of opts.configs) {
    if (!all[name]) throw new Error(`Unknown config "${name}" (expected ${Object.keys(all).join(", ")})`);
  }

  const results = { dataset: opts.dataset, status: dataset.status, repo: opts.repo, ks: opts.ks, runs: {} };

  for (const k of opts.ks) {
    results.runs[k] = {};
    for (const name of opts.configs) {
      const { repo, mode } = all[name];
      const retriever = buildRetriever(repo, { mode, k });
      const perQuestion = [];

      for (const item of dataset.questions) {
        // Truncate to k retrieved documents (what the LLM would actually be
        // shown), then collapse to distinct files for scoring.
        const docs = (await retriever.invoke(item.question)).slice(0, k);
        const retrieved = distinctFiles(docs);
        perQuestion.push({
          id: item.id,
          type: item.type,
          retrieved,
          expected: item.expectedFiles,
          ...scoreQuestion(retrieved, item.expectedFiles),
        });
      }
      results.runs[k][name] = perQuestion;
      console.error(`done: k=${k} config=${name}`);
    }
  }

  // Console report: overall + by question type, per k.
  const types = [...new Set(dataset.questions.map((q) => q.type))];
  const report = [`# Retrieval eval — repo \`${opts.repo}\` (${dataset.questions.length} questions, dataset status: ${dataset.status})`];
  for (const k of opts.ks) {
    const run = results.runs[k];
    report.push(`\n## k = ${k}`);
    report.push(table("**Overall**", Object.fromEntries(opts.configs.map((c) => [c, aggregate(run[c])])), opts.configs));
    for (const type of types) {
      const byCfg = Object.fromEntries(opts.configs.map((c) => [c, aggregate(run[c].filter((q) => q.type === type))]));
      report.push(table(`**${type}**`, byCfg, opts.configs));
    }
  }
  const text = report.join("\n");
  console.log(text);

  const outDir = path.join(here, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = opts.out ?? path.join(outDir, `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.error(`\nSaved per-question results to ${outFile}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
