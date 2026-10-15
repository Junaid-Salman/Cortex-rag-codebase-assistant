# Cortex — Findings

Measured results and observations from building and evaluating Cortex (RAG over source code).
Last updated 2026-10-15, after Phase 4B. Raw per-question data:
`src/eval/results/eval-2026-10-15T16-13-49-031Z.json`.

> **Scope:** all numbers below come from one test repo (`Social-Network-Backend`, 15 JS files,
> Express/CommonJS) and one 20-question dataset (`src/eval/dataset.json`). Treat them as
> indicative for a small corpus, not general benchmarks. Answer *correctness* has **not** been
> measured yet (Phase 4C).

---

## 1. System under test

| Item | Value |
|---|---|
| CPU | Intel Core i5-8250U @ 1.60GHz (max 3.4GHz), 8 threads |
| GPU | none (generation runs on CPU) |
| RAM | 15 GiB |
| OS | Linux 6.8.0-147-generic |
| Node.js | v22.16.0 |
| Ollama | 0.32.1 |
| Generation model | `llama3.1:8b` (4.9 GB) |
| Embedding model | `nomic-embed-text` (274 MB, 768 dims) |
| Vector store | Supabase (Postgres + pgvector), hosted |
| Orchestration | LangChain.js |

Timing figures depend heavily on this hardware (CPU-only inference, network latency to Supabase).

## 2. Index sizes (test repo)

| Index tag | Chunking | Chunks | Graph rows |
|---|---|---|---|
| `social-network-naive` | `RecursiveCharacterTextSplitter` (1000 / 100) | 30 | 0 |
| `social-network` | tree-sitter AST (top-level statements) | 64 | 407 |

## 3. Response time

Measured with hybrid retrieval (k=5) on 5 dataset questions, `Archieved/scratch-timing.js`.
"Retrieval" = embed the question + Supabase round trip; "generation" = total minus retrieval.

| Question | Retrieval | Generation | Total | Answer length |
|---|---|---|---|---|
| s02 (how JWT is verified) | 1.4s | 112.7s | 114.1s | 1067 chars |
| s03 (what happens on login) | 2.6s | 76.1s | 78.7s | 782 chars |
| t01 (what calls protect) | 0.5s | 92.7s | 93.2s | 564 chars |
| t03 (where followById is used) | 0.7s | 25.1s | 25.8s | 113 chars |
| c01 (create-post flow) | 0.8s | 146.6s | 147.4s | 1377 chars |
| **Average** | **1.2s** | **90.6s** | **91.8s** | |

- Retrieval is about 1% of total time; generation dominates.
- Generation time scales with answer length (113 chars: 26s, 1377 chars: 147s).
- Likely a best case: the machine was lightly loaded, and a cold model start adds load time.
- Reviewing ~10 answers (Phase 4C) therefore costs roughly 15 minutes of generation.
- Smaller local models (3B class) would be roughly 2-3x faster at some quality cost (estimate, not measured).

## 4. Retrieval quality — Phase 4B official eval

**Setup.** 20 hand-verified questions (8 semantic, 8 structural, 4 cross-file). Each config retrieves
k documents; those are collapsed to distinct files and scored against the expected files.

| Config | Index | Retriever |
|---|---|---|
| naive | `social-network-naive` | vector only |
| ast | `social-network` | vector only |
| hybrid | `social-network` | vector + code graph (EnsembleRetriever; what `ask` uses) |
| graph | `social-network` | code graph only (ablation) |

Metrics: **hit** = any expected file retrieved; **recall** = fraction of expected files retrieved;
**precision** = fraction of retrieved distinct files that are expected; **MRR** = mean reciprocal rank of
the first expected file.

### Headline: recall

| Config | recall@5 | recall@10 |
|---|---|---|
| naive | 83% | 96% |
| ast | 80% | 81% |
| **hybrid** | **99%** | **99%** |
| graph-only | 76% | 76% |

Hit-rate was 100% for naive, ast and hybrid at both k (saturated on this small corpus), so recall is
the metric that separates the configs. Graph-only hit-rate was 80%.

### Full tables

### k = 5

#### Overall

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 20 | 100% | 83% | 40% | 0.95 |
| ast | 20 | 100% | 80% | 54% | 0.94 |
| hybrid | 20 | 100% | 99% | 43% | 0.93 |
| graph | 20 | 80% | 76% | 40% | 0.68 |

#### Semantic questions (8)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 8 | 100% | 100% | 27% | 0.94 |
| ast | 8 | 100% | 100% | 39% | 1.00 |
| hybrid | 8 | 100% | 100% | 23% | 0.94 |
| graph | 8 | 63% | 63% | 7% | 0.38 |

#### Structural questions (8)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 8 | 100% | 72% | 46% | 0.94 |
| ast | 8 | 100% | 68% | 68% | 0.84 |
| hybrid | 8 | 100% | 100% | 73% | 0.88 |
| graph | 8 | 88% | 88% | 81% | 0.88 |

#### Cross-file questions (4)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 4 | 100% | 69% | 52% | 1.00 |
| ast | 4 | 100% | 63% | 56% | 1.00 |
| hybrid | 4 | 100% | 94% | 26% | 1.00 |
| graph | 4 | 100% | 81% | 24% | 0.88 |

### k = 10

#### Overall

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 20 | 100% | 96% | 29% | 0.95 |
| ast | 20 | 100% | 81% | 33% | 0.94 |
| hybrid | 20 | 100% | 99% | 30% | 0.91 |
| graph | 20 | 80% | 76% | 40% | 0.68 |

#### Semantic questions (8)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 8 | 100% | 100% | 16% | 0.94 |
| ast | 8 | 100% | 100% | 23% | 1.00 |
| hybrid | 8 | 100% | 100% | 15% | 0.94 |
| graph | 8 | 63% | 63% | 7% | 0.38 |

#### Structural questions (8)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 8 | 100% | 97% | 38% | 0.94 |
| ast | 8 | 100% | 68% | 38% | 0.84 |
| hybrid | 8 | 100% | 100% | 48% | 0.84 |
| graph | 8 | 88% | 88% | 81% | 0.88 |

#### Cross-file questions (4)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 4 | 100% | 88% | 39% | 1.00 |
| ast | 4 | 100% | 69% | 43% | 1.00 |
| hybrid | 4 | 100% | 94% | 26% | 1.00 |
| graph | 4 | 100% | 81% | 24% | 0.88 |

### Where each config missed (recall < 1)

| Config (k=5) | Imperfect questions |
|---|---|
| naive | t01, t02, t03, t06, t07, c01, c02, c03 (8) |
| ast | t01, t02, t03, t06, t07, c01, c02, c03 (8) |
| hybrid | c01 only (missing `middleware/authMiddleware.js`) |
| graph | s02, s04, s08, t08 (zero hits), c01, c04 |

At k=10 naive drops to 2 imperfect questions, ast stays at 8, hybrid and graph are unchanged.

Average distinct files retrieved per question:

| Config | k=5 | k=10 |
|---|---|---|
| naive | 4.0 | 7.0 |
| ast | 3.0 | 4.8 |
| hybrid | 6.8 | 8.1 |
| graph | 5.9 | 5.9 |

## 5. Findings

1. **Hybrid retrieval clearly wins.** Recall 99% at both k, versus 80-83% (k=5) for vector-only.
   On structural questions hybrid reaches 100% recall@5 against 72% (naive) and 68% (ast).
2. **AST chunking did not beat naive chunking at file level on this corpus.** At k=10, recall was
   81% (ast) vs 96% (naive). AST creates many small chunks per file, so the top-k chunks cover fewer
   distinct files (3.0 vs 4.0 at k=5). AST did have the best precision at k=5 (54% vs 40%).
3. **The file-level metric cannot see AST chunking's actual purpose** (not cutting a function in half
   inside a chunk). This result is not evidence that AST chunking is worse; answer quality (Phase 4C)
   is where its benefit should show if it exists.
4. **Hybrid's recall edge is partly structural.** A graph document surfaces several files at once, so
   hybrid returns 6.8 distinct files at k=5 versus 3.0 for ast. Its precision and recall are not a
   like-for-like comparison with vector-only configs.
5. **Graph-only fails where it should.** Zero hits on semantic questions s02, s04, s08 and on t08
   (`jwt.verify`, a library call with no definition in the repo). Hybrid covers these via the vector path,
   which justifies the hybrid design.
6. **Ensemble weighting is untested.** Hybrid used fixed 0.5/0.5 weights; no tuning was done.

## 6. Earlier findings

### Phase 2 — naive vs AST chunking (`docs/phase2-chunking-comparison.md`)
- Inconclusive: the test repo was a single 35-line file, so retrieval never had to choose between chunks.
- An early chunker only matched named functions/classes and silently fell back to one whole-file chunk for
  inline Express callbacks; fixed by chunking at top-level-statement granularity.
- Every file-path citation in the answers was hallucinated because chunk metadata never reached the
  prompt; fixed by passing `source` into the document prompt.

### Phase 3 — vector vs code graph (`docs/phase3-hybrid-retrieval.md`)
- The graph retriever returns complete answers where vector-only misses files (e.g. "which route files
  use `protect`": vector-only missed `followRoutes.js` and `postRoutes.js`; graph returned all 20 call sites).
- Bug found and fixed: substring file matching made the token `routes` match every route file; now exact
  path / basename matching.
- Semantic questions return no graph documents, so the graph path stays out of the way.

## 7. Known limitations and observations

- **Generation quality (llama3.1:8b).** Observed in end-to-end runs: dropped `likeRoutes.js` from the
  `protect` answer even though it was in the retrieved context; invented line numbers for imports
  (the graph does not record them); occasionally guessed file paths in Phase 2. Not yet measured.
- **Name-based call graph.** References are matched by name (`foo()` and `a.b.foo()` both record `foo`), so
  same-named functions in different files are not distinguished; "imported by" matches on basename.
- **Graph file documents** have no line ranges (matters for Phase 4C citations).
- **Graph retriever** loads every `code_graph` row for the repo on each query; fine at 407 rows.
- **Dataset size and bias.** 20 questions over one 15-file repo, written by reading the code with the
  retrieval design in mind (mitigated by hand verification against the source with grep).
- **`t06`** ("which files import the User model") expects 11 files, so recall@5 is capped near 45% by design.

## 8. Not yet measured

- Answer correctness and hallucination rate (Phase 4C manual review).
- Effect of line-range citations on invented line numbers.
- Larger or multi-language repos.
- Alternative ensemble weights, smaller/faster generation models.
