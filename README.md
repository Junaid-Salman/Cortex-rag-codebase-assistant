# Cortex

A RAG-powered codebase Q&A assistant: point it at a repo, ask a natural-language question, and get an
answer grounded in the actual code, with file and line-range citations. Embeddings and generation both
run locally via Ollama, so there are no paid API keys.

```
$ node src/cli.js ask social-network "Where is followById used?"

The function `followById` is referenced/called at: routes/followRoutes.js (module scope, line 20)
```

Cortex answers two kinds of question that need different retrieval:

- **Semantic:** "How is a user's password hashed?" Found by vector similarity over code chunks.
- **Structural:** "What calls `protect`?" or "Which files import the User model?" Similarity search
  cannot answer these reliably, so Cortex also keeps a call/import graph of the repo and combines both.

---

## Why this project

Most beginner RAG projects are "chat with your PDF." Source code is a harder, more realistic domain that
exposes the parts of RAG that matter in practice: how you chunk, what similarity search cannot see,
and whether you can measure any of it. This repo is built to be evaluated, not just demoed. Every claim
below is backed by an evaluation harness and a hand-verified dataset in this repository.

---

## How it works

```
                      INDEXING
  Source repo ──► loadRepo ──► chunk ──────────► embed (Ollama) ──► Supabase code_chunks (pgvector)
                      │      (tree-sitter AST,
                      │       or --chunker naive)
                      └──► extractGraph ───────────────────────────► Supabase code_graph
                           (functions, call/reference sites, imports)

                      QUERYING
  Question ──┬──► vector retriever (top-k chunks) ───┐
             │                                       ├─► ensemble ──► prompt with
             └──► graph retriever (who calls / imports)┘   (rank fusion)   "File: path (lines a-b)"
                                                                           headers ──► llama3.1:8b
                                                                                         │
                                                                              answer with citations
```

1. **Ingestion.** Walks the repo and skips `node_modules`, `.git`, build output, etc.
2. **AST-aware chunking.** `tree-sitter` splits each JS/TS file at top-level statement boundaries:
   each function or class (classes split per method) is one chunk, and runs of imports/constants/setup
   code are grouped. Comments directly above a function stay in its chunk. A character-based splitter
   is available (`--chunker naive`) as the evaluation baseline.
3. **Code graph.** The same AST pass records function definitions, call and reference sites (including
   bare-identifier route wiring like `router.get('/x', protect, handler)`), and `import`/`require`
   statements, stored per repo in Supabase.
4. **Hybrid retrieval.** A vector retriever (nomic-embed-text embeddings in pgvector) and a graph retriever
   are merged with LangChain's `EnsembleRetriever`. The graph retriever fires on function names and file
   paths in the question and stays silent on purely semantic questions.
5. **Cited generation.** Each retrieved block is shown to the model under a
   `File: path (lines a-b)` header, with rules to copy paths and line numbers exactly and never invent them.

---

## Results

Measured on one test repo ([Social-Network-Backend](docs/phase4-eval-results.md#dataset): 15 JS files,
Express) with 20 hand-verified questions (8 semantic, 8 structural, 4 cross-file). **Recall** is the
fraction of the expected source files that appear in the top-k retrieved documents.

| Retrieval config | recall@5 | recall@10 | structural recall@5 |
|---|---|---|---|
| naive chunks, vector only | 83% | 96% | 72% |
| AST chunks, vector only | 80% | 81% | 68% |
| **AST chunks + code graph (hybrid)** | **99%** | **99%** | **100%** |
| code graph only (ablation) | 76% | 76% | 88% |

What the results say, including the parts that do not flatter the project:

- **Hybrid retrieval is the clear win.** It fixes the structural questions that similarity search
  misses, and the vector half covers the questions the graph cannot answer on its own (graph-only
  retrieves nothing relevant for four of the 20 questions).
- **AST chunking did not beat naive chunking on file-level recall** here (81% vs 96% at k=10). Its
  benefit, not cutting functions in half, is not visible to a file-level metric. A first AST chunker
  also emitted comment-only chunks that caused a real retrieval failure; fixing that left recall
  unchanged, which disproved my hypothesis that the comments explained the gap
  ([details](findings.md)).
- **Citations:** in a manual review of 10 generated answers, adding line ranges and citation rules
  raised defect-free answers from 2/10 to 7/10 and removed all wrong file attributions and wrong line
  numbers. Part of that gain is shorter answers. Small sample, one reviewer, one sample per question
  ([review](src/eval/answers/review.md)).
- **Speed:** retrieval takes about 1 second; generation takes roughly 1.5 to 2+ minutes per answer on a
  CPU-only laptop (Core i5-8250U, no GPU), longer when the machine is busy. See
  [`findings.md`](findings.md) for system specs.

Full methodology, per-question tables and failure analysis:
[`docs/phase4-eval-results.md`](docs/phase4-eval-results.md) and [`findings.md`](findings.md)
(also as [`findings.html`](findings.html)).

---

## Stack

| Layer | Choice |
|---|---|
| Language | JavaScript (Node.js 18+, ESM) |
| RAG framework | [LangChain.js](https://js.langchain.com) |
| Code parsing | `tree-sitter` with the JavaScript and TypeScript grammars |
| Embeddings | [Ollama](https://ollama.com) `nomic-embed-text` (768 dims, local, free) |
| Generation | Ollama `llama3.1:8b` (local, free) |
| Vector store + graph | [Supabase](https://supabase.com) (Postgres + `pgvector`) |

---

## Setup

### Prerequisites
- Node.js 18+
- [Ollama](https://ollama.com) installed and running
- A free [Supabase](https://supabase.com) project

### 1. Install Ollama models
```bash
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

### 2. Set up Supabase
In your Supabase project's SQL editor, run:
```sql
create extension if not exists vector;

create table code_chunks (
  id uuid primary key default gen_random_uuid(),
  content text,
  metadata jsonb,
  embedding vector(768)
);

create or replace function match_code_chunks (
  query_embedding vector(768),
  match_count int default 5,
  filter jsonb default '{}'
) returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    code_chunks.id,
    code_chunks.content,
    code_chunks.metadata,
    1 - (code_chunks.embedding <=> query_embedding) as similarity
  from code_chunks
  where code_chunks.metadata @> filter
  order by code_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Code graph (functions, call/reference sites, imports) used by the
-- graph retriever for structural questions like "what calls X".
create table if not exists code_graph (
  id bigint generated always as identity primary key,
  repo text not null,
  kind text not null,          -- 'function' | 'reference' | 'import'
  name text,
  scope text,
  file text,
  start_line int,
  end_line int,
  data jsonb
);
create index if not exists code_graph_repo_kind_idx on code_graph (repo, kind);
create index if not exists code_graph_repo_name_idx on code_graph (repo, name);
```

### 3. Install dependencies
```bash
npm install --legacy-peer-deps
```

### 4. Configure environment
Create a `.env` file (it is git-ignored). Use the Supabase **service-role** key, which the app needs for
inserts and which bypasses row-level security, so never expose it in client-side code:
```env
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_KEY=your_secret_key
```

---

## Usage

**Index a repo** (AST chunking + code graph by default; re-indexing a name replaces its old rows):
```bash
node src/cli.js index <path-to-repo> <repo-name>
node src/cli.js index <path-to-repo> <repo-name>-naive --chunker naive   # baseline for comparisons
```

**Ask a question** (hybrid retrieval, cited answer):
```bash
node src/cli.js ask <repo-name> "What calls the protect middleware?"
```

**Run the retrieval evaluation** (needs both the AST and `-naive` indexes of the dataset's repo):
```bash
npm run eval                                   # all configs at k=5 and k=10
node src/eval/runEval.js --configs hybrid --k 5
```

**Review answer citations:**
```bash
node src/eval/generateAnswers.js --prompt cited   # slow: ~1-6 minutes per answer on CPU
node src/eval/checkCitations.js                   # invented paths, ungrounded files, bad line numbers
```

**Unit tests:**
```bash
npm test
```

Generation on CPU is slow (see Results). `cli.js` disables Node's request timeouts for that reason.

---

## Project structure

```
cortex/
├── src/
│   ├── ingest/
│   │   ├── loadRepo.js          # walks a repo, filters source files
│   │   ├── chunkCode.js         # tree-sitter AST chunking (comments stay with their code)
│   │   ├── extractGraph.js      # AST walk: functions, call/reference sites, imports
│   │   ├── buildGraph.js        # stores graph rows in Supabase
│   │   └── buildIndex.js        # chunk (ast|naive), embed, store; builds the graph for ast
│   ├── retrieval/
│   │   ├── vectorRetriever.js   # pgvector similarity retrieval (+ shared Supabase client)
│   │   ├── graphRetriever.js    # call-graph / import-graph lookup
│   │   └── buildRetriever.js    # vector | graph | hybrid (EnsembleRetriever)
│   ├── chain/
│   │   ├── qaChain.js           # retrieval + generation chain
│   │   ├── prompts.js           # "cited" prompt (and the "legacy" one used for comparison)
│   │   └── citations.js         # labels each retrieved doc with its line range
│   ├── eval/
│   │   ├── dataset.json         # 20 hand-verified questions with expected files
│   │   ├── runEval.js           # recall / precision / MRR across configs
│   │   ├── metrics.js           # scoring functions
│   │   ├── generateAnswers.js   # saves answers + the context the model saw
│   │   ├── citationCheck.js     # deterministic citation checks
│   │   ├── checkCitations.js    # report over saved answers
│   │   ├── results/             # raw per-question eval results
│   │   └── answers/             # generated answers and the manual review
│   └── cli.js                   # entry point: index | ask
├── docs/                        # per-phase write-ups and the eval results
├── findings.md / findings.html  # measured results, timings, limitations
├── Archieved/                   # one-off scripts used during development
└── package.json
```

---

## Limitations

- **JavaScript and TypeScript only.** `loadRepo` also picks up Python, Java, Go and others, but the
  parser only has JS/TS grammars: other files end up as a single whole-file chunk with no graph data.
- **Small evaluation.** One 15-file repo, 20 questions, written by the author and hand-verified against
  the source. Hit-rate saturates at 100% on a corpus this small, so recall is the metric that separates
  configurations. Treat the numbers as indicative, not as benchmarks.
- **The call graph is name-based.** `foo()` and `a.b.foo()` both record `foo`, so same-named functions
  in different files are not distinguished, and "imported by" matches on file basename.
- **Answer review is manual and small:** 10 answers, one reviewer, one sample per question. Most of those
  answers were generated before a later chunker fix and were not regenerated.
- **Local model quality.** `llama3.1:8b` occasionally speculates or omits items that were in its context.
  Swapping in a hosted model is a small change in `qaChain.js`, but it is not evaluated here.
- **Generation is slow on CPU** (roughly 1.5 to 2+ minutes per answer on the reference laptop).

---

## Roadmap

- [x] **v0** naive end-to-end RAG pipeline
- [x] **v1** AST-aware chunking, with a [comparison against character splitting](docs/phase2-chunking-comparison.md)
- [x] **v2** hybrid retrieval: vector search plus a code call/import graph ([write-up](docs/phase3-hybrid-retrieval.md))
- [x] **v3** evaluation harness, line-range citations and a hallucination review ([results](docs/phase4-eval-results.md))
- [ ] **Phase 5 (optional polish):** minimal web UI, demo recording, second repo to demonstrate multi-repo
  filtering and give the evaluation a harder corpus
- [ ] Embedding space visualization (2D projection of stored vectors, to sanity-check chunking quality)
- [ ] Corrective RAG: self-grading retrieval with automatic re-querying
- [ ] Agentic RAG: model-driven, multi-step retrieval across vector and graph sources
- [ ] Conversational memory: multi-turn question answering with follow-up resolution
- [ ] Tune the ensemble weights (fixed at 0.5 / 0.5 so far) and evaluate smaller or hosted generation models

---

## License

MIT
