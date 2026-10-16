# Cortex — Findings

Measured results and observations from building and evaluating Cortex (RAG over source code).
Last updated 2026-10-16, after the Phase 4C comment-chunk fix. Raw per-question retrieval data:
`src/eval/results/eval-2026-10-16T11-54-48-975Z.json` (current, after the chunker fix) and
`src/eval/results/eval-2026-10-15T16-13-49-031Z.json` (before the fix, kept for comparison).

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

The AST index had 64 chunks before the comment fix described in section 5 (14 of them comment-only).

| Index tag | Chunking | Chunks | Graph rows |
|---|---|---|---|
| `social-network-naive` | `RecursiveCharacterTextSplitter` (1000 / 100) | 30 | 0 |
| `social-network` | tree-sitter AST (top-level statements, leading comments attached) | 50 | 407 |

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
the metric that separates the configs. Graph-only hit-rate was 80%. These numbers were identical before
and after the comment-chunk fix (section 5.1).

### Full tables (after the comment-chunk fix)

### k = 5

#### Overall

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 20 | 100% | 83% | 40% | 0.95 |
| ast | 20 | 100% | 80% | 46% | 0.91 |
| hybrid | 20 | 100% | 99% | 43% | 0.90 |
| graph | 20 | 80% | 76% | 40% | 0.68 |

#### Semantic questions (8)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 8 | 100% | 100% | 27% | 0.94 |
| ast | 8 | 100% | 100% | 36% | 1.00 |
| hybrid | 8 | 100% | 100% | 23% | 0.94 |
| graph | 8 | 63% | 63% | 7% | 0.38 |

#### Structural questions (8)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 8 | 100% | 72% | 46% | 0.94 |
| ast | 8 | 100% | 68% | 55% | 0.84 |
| hybrid | 8 | 100% | 100% | 73% | 0.88 |
| graph | 8 | 88% | 88% | 81% | 0.88 |

#### Cross-file questions (4)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 4 | 100% | 69% | 52% | 1.00 |
| ast | 4 | 100% | 63% | 48% | 0.88 |
| hybrid | 4 | 100% | 94% | 26% | 0.88 |
| graph | 4 | 100% | 81% | 24% | 0.88 |

### k = 10

#### Overall

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 20 | 100% | 96% | 29% | 0.95 |
| ast | 20 | 100% | 81% | 28% | 0.91 |
| hybrid | 20 | 100% | 99% | 29% | 0.86 |
| graph | 20 | 80% | 76% | 40% | 0.68 |

#### Semantic questions (8)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 8 | 100% | 100% | 16% | 0.94 |
| ast | 8 | 100% | 100% | 19% | 1.00 |
| hybrid | 8 | 100% | 100% | 14% | 0.85 |
| graph | 8 | 63% | 63% | 7% | 0.38 |

#### Structural questions (8)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 8 | 100% | 97% | 38% | 0.94 |
| ast | 8 | 100% | 68% | 35% | 0.84 |
| hybrid | 8 | 100% | 100% | 46% | 0.85 |
| graph | 8 | 88% | 88% | 81% | 0.88 |

#### Cross-file questions (4)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 4 | 100% | 88% | 39% | 1.00 |
| ast | 4 | 100% | 69% | 36% | 0.88 |
| hybrid | 4 | 100% | 94% | 26% | 0.88 |
| graph | 4 | 100% | 81% | 24% | 0.88 |

### Where each config missed (recall < 1)

| Config (k=5) | Imperfect questions |
|---|---|
| naive | t01, t02, t03, t06, t07, c01, c02, c03 (8) |
| ast | t01, t02, t03, t06, t07, c01, c02, c03 (8) |
| hybrid | c01 only (missing `middleware/authMiddleware.js`) |
| graph | s02, s04, s08, t08 (zero hits), c01, c04 |

At k=10 naive drops to 2 imperfect questions (t06, c01), ast stays at 8, hybrid (c01) and graph are unchanged.

Average distinct files retrieved per question:

| Config | k=5 | k=10 |
|---|---|---|
| naive | 4.0 | 7.0 |
| ast | 3.2 | 5.5 |
| hybrid | 6.8 | 8.2 |
| graph | 5.9 | 5.9 |

## 5. Findings

1. **Hybrid retrieval clearly wins.** Recall 99% at both k, versus 80-83% (k=5) for vector-only.
   On structural questions hybrid reaches 100% recall@5 against 72% (naive) and 68% (ast).
2. **AST chunking did not beat naive chunking at file level on this corpus.** At k=10, recall was
   81% (ast) vs 96% (naive). AST creates more, smaller chunks, so the top-k chunks cover fewer
   distinct files (3.2 vs 4.0 at k=5). AST did have the best precision of the vector configs at k=5
   (46% vs 40%).
3. **The file-level metric cannot see AST chunking's actual purpose** (not cutting a function in half
   inside a chunk). This result is not evidence that AST chunking is worse; answer quality (section 6)
   is where its benefit should show if it exists.
4. **Hybrid's recall edge is partly structural.** A graph document surfaces several files at once, so
   hybrid returns 6.8 distinct files at k=5 versus 3.2 for ast. Its precision and recall are not a
   like-for-like comparison with vector-only configs.
5. **Graph-only fails where it should.** Zero hits on semantic questions s02, s04, s08 and on t08
   (`jwt.verify`, a library call with no definition in the repo). Hybrid covers these via the vector path,
   which justifies the hybrid design.
6. **Ensemble weighting is untested.** Hybrid used fixed 0.5/0.5 weights; no tuning was done.

### 5.1 Comment-chunk fix: before and after

The first AST chunker emitted comments as separate chunks: 14 of 64 chunks (22%) were comment-only
(e.g. `// 2 - Create a Post`) and 21 were under 60 characters. The hypothesis was that these wasted
fixed-k retrieval slots and explained part of AST's lower recall. The chunker now folds comments that
precede a function or class into that chunk, keeps same-line trailing comments with their statement,
and keeps comments before simple statements in the setup group (12 unit tests,
`src/ingest/chunkCode.test.js`). It also now computes the setup chunk's end line from its last
statement instead of the next function's start. The AST index was rebuilt and the retrieval eval
re-run.

| | Before | After |
|---|---|---|
| AST chunks | 64 | 50 |
| Comment-only chunks | 14 | 0 |
| Chunks under 60 chars | 21 | 7 |

| Retrieval eval | k=5 before | k=5 after | k=10 before | k=10 after |
|---|---|---|---|---|
| ast recall | 80% | 80% | 81% | 81% |
| ast precision | 54% | 46% | 33% | 28% |
| ast MRR | 0.94 | 0.91 | 0.94 | 0.91 |
| ast avg distinct files | 3.0 | 3.2 | 4.8 | 5.5 |
| hybrid recall | 99% | 99% | 99% | 99% |
| hybrid MRR | 0.93 | 0.90 | 0.91 | 0.86 |
| naive (unchanged) recall | 83% | 83% | 96% | 96% |

- **The hypothesis was not supported for recall.** AST recall is identical before and after, at every
  k and for every question type. Coverage of distinct files went up (4.8 to 5.5 at k=10) but the extra
  files were not the expected ones, so precision and MRR dropped slightly.
- **The files AST still misses are mostly cross-file relationships** (who calls `protect`, who imports
  `authController`, where `followById` is used). Similarity search over code text cannot retrieve
  these regardless of how the code is chunked, which is what the graph retriever is for.
- **Why naive still wins on recall at k=10 is not verified.** A plausible explanation is that its
  coarse 1000-character chunks cover several route handlers each and so mention many entities at once;
  this was not tested.
- **The fix still matters for answers:** it makes the real `createPost` chunk retrievable.
- **`c01` re-run (cited prompt, post-fix index):** the answer now describes the real flow: it cites
  `controller/postController.js (lines 21-41)` (correct range) and correctly states that `createPost`
  rejects empty content with a 400, builds a `Post` with the user's id as creator, saves it, and
  updates the user's `posts`. Remaining defects: one unsupported inference ("we can infer
  `routes/postRoutes.js`..."), one imprecise endpoint (`/posts` instead of `/posts/createPost`), and
  it omits the `protect` middleware. Under the pre-fix index the same question produced an answer
  about the wrong feature with 6 defects. Single sample, one question; per-answer notes in
  `src/eval/answers/review.md`. The other 9 reviewed answers were not regenerated against the new index.

## 6. Answer quality — Phase 4C

Manual claim-by-claim review of 10 generated answers (3 semantic, 4 structural, 3 cross-file) under two
prompts, plus automatic citation checks. These answers were generated **before** the comment-chunk fix
(section 5.1), against the 64-chunk AST index. Full per-answer notes, the defect rubric and a spot-check
list: `src/eval/answers/review.md`. Same model (`llama3.1:8b`), same hybrid retrieval (k=5), one
sample per question.

- **legacy** prompt: "cite the file path for each claim".
- **cited** prompt: context blocks headed `File: path (lines a-b)` plus rules to copy paths/lines
  exactly and never invent them.

| | legacy | cited |
|---|---|---|
| Answers with no defect | 2 / 10 | 7 / 10 |
| Total defects | 16 | 8 |
| Total excluding `c01` (retrieval failure in both) | 14 | 2 |
| Wrong file attributions | 4 | 0 |
| Wrong line claims | 4 (5 citations) | 0 |
| Wrong or invented details | 4 | 3 |
| Unsupported speculation | 3 | 3 |
| Omissions | 0 | 1 |
| Avg answer length | 874 chars | 650 chars |

Automatic citation checker (`src/eval/checkCitations.js`):

| | legacy | cited |
|---|---|---|
| Invented file paths | 0 | 0 |
| Line citations counted | 26 | 30 |
| Flagged invalid | 2 | 0 |
| Wrong line citations found manually | 5 | 0 |

Findings:

1. **Line-range headers plus explicit citation rules removed the wrong-file and wrong-line errors** in
   this sample: 4 misattributions and 4 wrong line claims with the legacy prompt, none with the cited
   prompt. All 30 line citations in the cited answers are correct.
2. **Part of the gain is terseness.** Cited answers are about 26% shorter, so there were fewer claims
   to get wrong; the cost shows up as an omission (`t01` dropped one of five call sites) and thinner
   explanations.
3. **The automatic checker is only a floor.** It caught 2 of the 5 wrong legacy line citations, because
   a line inside a retrieved range passes even when it is off by one, and it cannot see wrong file
   attributions or wrong details. It is still useful for confirming the cited prompt's citations.
4. **`c01` failed under both prompts because of retrieval, not generation.** The real `createPost`
   function was never retrieved; a comment-only chunk (`// 2 - Create a Post`) took its slot, and the
   model answered about comments or speculated. Prompting cannot fix missing context.
5. **Comment-only chunks caused the `c01` retrieval failure.** 14 of the 64 AST chunks (22%) were
   comment-only. The fix and its retrieval-eval effect are in section 5.1; the regenerated `c01` answer
   is below.
6. **Generation time.** Legacy averaged 135s per answer and cited 288s, but the cited run overlapped
   with other work on the same CPU-only machine, so the difference is not a clean measurement of the
   prompt.

Caveats: 10 questions, one repo, one reviewer (the model assisting the user), one sample per question
at default sampling temperature (individual answers vary run to run, e.g. an earlier CLI run of `t01`
dropped `likeRoutes.js`). Counts are directional, not statistically significant.

## 7. Earlier findings

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

## 8. Known limitations and observations

- **Generation quality (llama3.1:8b).** Measured in section 6 on 10 answers. Beyond those results:
  it dropped `likeRoutes.js` from a `protect` answer in an earlier CLI run even though it was in the
  retrieved context, and guessed file paths in Phase 2 before paths were passed to the prompt.
- **Name-based call graph.** References are matched by name (`foo()` and `a.b.foo()` both record `foo`), so
  same-named functions in different files are not distinguished; "imported by" matches on basename.
- **Graph file documents** have no line ranges, so answers about a file's imports can only cite the file path.
- **Graph retriever** loads every `code_graph` row for the repo on each query; fine at 407 rows.
- **Dataset size and bias.** 20 questions over one 15-file repo, written by reading the code with the
  retrieval design in mind (mitigated by hand verification against the source with grep).
- **`t06`** ("which files import the User model") expects 11 files, so recall@5 is capped near 45% by design.

## 9. Not yet measured

- Answer quality at scale: more than 10 questions, multiple samples per question, an independent reviewer.
- The effect of fixing comment-only AST chunks on the retrieval eval and on `c01`.
- Larger or multi-language repos.
- Alternative ensemble weights, smaller/faster generation models.
