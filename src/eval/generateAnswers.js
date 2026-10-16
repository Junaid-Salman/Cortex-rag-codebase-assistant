import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Agent, setGlobalDispatcher } from "undici";
import { askQuestionDetailed } from "../chain/qaChain.js";
import { PROMPT_VERSIONS } from "../chain/prompts.js";

setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }));

const here = path.dirname(fileURLToPath(import.meta.url));

// 3 semantic, 4 structural (incl. the hard ones t06/t08), 3 cross-file.
const DEFAULT_IDS = ["s02", "s03", "s06", "t01", "t03", "t06", "t08", "c01", "c02", "c04"];

/**
 * Generate answers with the full chain and save each one together with the
 * exact context the model was shown, so the review can check every claim and
 * citation against it. Slow on CPU (~90s per answer) -- run in the background.
 *
 * Usage: node src/eval/generateAnswers.js --prompt legacy|cited [--ids s02,t01] [--out file]
 * Saves after every question and skips ids already present in --out, so an
 * interrupted run can be resumed by re-running the same command.
 */
function parseArgs(argv) {
  const opts = { prompt: "cited", ids: DEFAULT_IDS, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--prompt") opts.prompt = argv[++i];
    else if (argv[i] === "--ids") opts.ids = argv[++i].split(",");
    else if (argv[i] === "--out") opts.out = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!PROMPT_VERSIONS.includes(opts.prompt)) throw new Error(`--prompt must be one of ${PROMPT_VERSIONS.join(", ")}`);
  opts.out ??= path.join(here, "answers", `answers-${opts.prompt}.json`);
  return opts;
}

// Supabase occasionally rejects a request transiently (e.g. PGRST303 "JWT
// issued at future" from server-side clock skew); retry instead of losing a
// long run.
async function withRetry(fn, attempts = 3, delayMs = 10000) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      console.error(`attempt ${i} failed (${err.message}); retrying in ${delayMs / 1000}s`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dataset = JSON.parse(fs.readFileSync(path.join(here, "dataset.json"), "utf-8"));
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });

  const saved = fs.existsSync(opts.out)
    ? JSON.parse(fs.readFileSync(opts.out, "utf-8"))
    : { repo: dataset.repo, promptVersion: opts.prompt, model: "llama3.1:8b", answers: [] };

  for (const id of opts.ids) {
    if (saved.answers.some((a) => a.id === id)) {
      console.error(`skip ${id} (already saved)`);
      continue;
    }
    const item = dataset.questions.find((q) => q.id === id);
    if (!item) throw new Error(`Unknown question id ${id}`);

    const t = performance.now();
    const { answer, context } = await withRetry(() =>
      askQuestionDetailed(item.question, dataset.repo, { promptVersion: opts.prompt }),
    );
    const seconds = Math.round((performance.now() - t) / 1000);

    saved.answers.push({
      id,
      type: item.type,
      question: item.question,
      expectedFiles: item.expectedFiles,
      seconds,
      answer,
      context: context.map((d) => ({
        source: d.metadata.source,
        startLine: d.metadata.startLine ?? null,
        endLine: d.metadata.endLine ?? null,
        files: d.metadata.files ?? null,
        text: d.pageContent,
      })),
    });
    fs.writeFileSync(opts.out, JSON.stringify(saved, null, 2));
    console.error(`done ${id} (${seconds}s) -> ${opts.out}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
