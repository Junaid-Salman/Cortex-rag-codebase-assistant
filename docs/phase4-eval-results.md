# Phase 4 — Evaluation Results

What was measured, how, and what it shows. Machine specs, response times and the running list of
limitations live in [`../findings.md`](../findings.md); this document is the methodology and the
retrieval/answer-quality analysis behind the README's results table.

Raw data: `src/eval/results/eval-2026-10-16T11-54-48-975Z.json` (current) and
`eval-2026-10-15T16-13-49-031Z.json` (before the comment-chunk fix, section 6).
Reproduce with `npm run eval` after indexing the repo (see the README).

---

## Dataset

- **Repo under test:** `Social-Network-Backend`, a 15-file Express/Mongoose API (CommonJS, ~650 lines).
  Indexed three ways: `social-network-naive` (30 character-based chunks), and `social-network`
  (50 AST chunks plus 407 code-graph rows).
- **Questions:** 20 in `src/eval/dataset.json`: 8 semantic ("how is a password hashed"), 8 structural
  ("what calls `protect`", "which files import the User model"), 4 cross-file ("how does a request to
  create a post flow from route to database").
- **Ground truth:** a list of expected source files per question. The questions were written by reading
  the source, not by looking at retriever output, and every expected-file list and line reference was
  re-verified against the code with `grep` before the official run. The dataset was marked
  `reviewed` by the user before any results were recorded; `runEval.js` refuses to run on a draft.
- **Convention:** when a question names an entity defined in the repo (a function, middleware, model),
  its defining file is expected alongside the files that use it.
- **Why not GitHub issues:** the plan suggested mining them, but the test repo is not a git repo and has none.

## Method

For each question and configuration, retrieve `k` documents (k = 5 and 10), collapse them to the ordered
list of distinct files, and compare with the expected files.

| Config | Index | Retriever |
|---|---|---|
| naive | `social-network-naive` | vector only |
| ast | `social-network` | vector only |
| hybrid | `social-network` | vector + code graph (`EnsembleRetriever`, weights 0.5 / 0.5; what `ask` uses) |
| graph | `social-network` | code graph only (ablation) |

- **hit:** any expected file retrieved. **recall:** fraction of expected files retrieved.
  **precision:** fraction of retrieved distinct files that are expected. **MRR:** reciprocal rank of
  the first expected file, averaged.
- Every config is truncated to the same `k` *documents* before files are counted, so each sees the same
  number of retrieved items. Graph documents list several files at once (`metadata.files`), so hybrid
  and graph retrieve more distinct files per document than chunk-only configs (see threats to validity).
- Scoring is deterministic: the harness was checked with a deliberately wrong expected file (counted
  as a miss) and two identical runs produced byte-identical output.

## Retrieval results (current, after the chunker fix)

#### k = 5

##### Overall

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 20 | 100% | 83% | 40% | 0.95 |
| ast | 20 | 100% | 80% | 46% | 0.91 |
| hybrid | 20 | 100% | 99% | 43% | 0.90 |
| graph | 20 | 80% | 76% | 40% | 0.68 |

##### Semantic questions (8)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 8 | 100% | 100% | 27% | 0.94 |
| ast | 8 | 100% | 100% | 36% | 1.00 |
| hybrid | 8 | 100% | 100% | 23% | 0.94 |
| graph | 8 | 63% | 63% | 7% | 0.38 |

##### Structural questions (8)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 8 | 100% | 72% | 46% | 0.94 |
| ast | 8 | 100% | 68% | 55% | 0.84 |
| hybrid | 8 | 100% | 100% | 73% | 0.88 |
| graph | 8 | 88% | 88% | 81% | 0.88 |

##### Cross-file questions (4)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 4 | 100% | 69% | 52% | 1.00 |
| ast | 4 | 100% | 63% | 48% | 0.88 |
| hybrid | 4 | 100% | 94% | 26% | 0.88 |
| graph | 4 | 100% | 81% | 24% | 0.88 |

#### k = 10

##### Overall

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 20 | 100% | 96% | 29% | 0.95 |
| ast | 20 | 100% | 81% | 28% | 0.91 |
| hybrid | 20 | 100% | 99% | 29% | 0.86 |
| graph | 20 | 80% | 76% | 40% | 0.68 |

##### Semantic questions (8)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 8 | 100% | 100% | 16% | 0.94 |
| ast | 8 | 100% | 100% | 19% | 1.00 |
| hybrid | 8 | 100% | 100% | 14% | 0.85 |
| graph | 8 | 63% | 63% | 7% | 0.38 |

##### Structural questions (8)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 8 | 100% | 97% | 38% | 0.94 |
| ast | 8 | 100% | 68% | 35% | 0.84 |
| hybrid | 8 | 100% | 100% | 46% | 0.85 |
| graph | 8 | 88% | 88% | 81% | 0.88 |

##### Cross-file questions (4)

| config | n | hit | recall | precision | MRR |
|---|---|---|---|---|---|
| naive | 4 | 100% | 88% | 39% | 1.00 |
| ast | 4 | 100% | 69% | 36% | 0.88 |
| hybrid | 4 | 100% | 94% | 26% | 0.88 |
| graph | 4 | 100% | 81% | 24% | 0.88 |

### Per-question recall@5

| id | type | question | # expected | naive | ast | hybrid | graph |
|---|---|---|---|---|---|---|---|
| s01 | semantic | How is a user's password hashed before it is stored in the database? | 1 | 100% | 100% | 100% | 100% |
| s02 | semantic | How does the server verify a JWT and reject requests that are not authenticated? | 1 | 100% | 100% | 100% | 0% |
| s03 | semantic | What happens when a user logs in with an email and password? | 1 | 100% | 100% | 100% | 100% |
| s04 | semantic | How does the application connect to MongoDB and what happens if the connection fails? | 1 | 100% | 100% | 100% | 0% |
| s05 | semantic | Who is allowed to delete a comment? | 1 | 100% | 100% | 100% | 100% |
| s06 | semantic | How does editing an existing post work and what authorization check is done? | 1 | 100% | 100% | 100% | 100% |
| s07 | semantic | What fields does a comment have in the database schema? | 1 | 100% | 100% | 100% | 100% |
| s08 | semantic | Which URL prefixes are the different route groups mounted under in the app? | 1 | 100% | 100% | 100% | 0% |
| t01 | structural | What calls protect? | 5 | 80% | 60% | 100% | 100% |
| t02 | structural | Where is createPost used? | 2 | 50% | 50% | 100% | 100% |
| t03 | structural | Where is followById used? | 2 | 50% | 50% | 100% | 100% |
| t04 | structural | Where is connectDatabase called? | 2 | 100% | 100% | 100% | 100% |
| t05 | structural | What does routes/followRoutes.js import? | 1 | 100% | 100% | 100% | 100% |
| t06 | structural | Which files import the User model? | 11 | 45% | 36% | 100% | 100% |
| t07 | structural | Which files import authController? | 2 | 50% | 50% | 100% | 100% |
| t08 | structural | Where is jwt.verify called? | 1 | 100% | 100% | 100% | 0% |
| c01 | cross-file | How does a request to create a post flow from the route to the database? | 4 | 50% | 25% | 75% | 75% |
| c02 | cross-file | How is the feed of posts built for a user, and how do public and private accounts affect it? | 2 | 50% | 50% | 100% | 100% |
| c03 | cross-file | How is a comment linked to its post and its author in the data model, and what code keeps both sides in sync when a comment is created? | 4 | 75% | 75% | 100% | 100% |
| c04 | cross-file | How does a logged-in user's token get checked on protected endpoints after login? | 2 | 100% | 100% | 100% | 50% |

## Failure analysis

**Vector-only configs (naive, ast) miss relationship questions.** The questions where they score only 36-80%
recall@5 are the ones whose answer is a *set of other files*: `t01` (what calls `protect`), `t02`/`t03`
(where `createPost` / `followById` are used), `t06` (who imports the User model), `t07` (who imports
`authController`). Similarity search finds the file that defines the thing but not the route files that
wire it up, because those files are not semantically about it. `t06` is capped by design: 11 expected
files cannot all fit in 5 documents. Chunking strategy did not change this (AST and naive miss the same
questions).

**Hybrid reaches 100% recall on every structural question** because the graph retriever returns the
definition and every reference or importer as one document. Its only miss is `c01`, in both k settings:
the expected `middleware/authMiddleware.js` (the `protect` middleware on the create-post route) is not
retrieved, plausibly because the question never mentions authentication or the middleware by name, so
neither retriever has a reason to surface it. (The route file `postRoutes.js` is counted as retrieved,
via the `model/Post.js` graph document that lists its importers.)

**Cross-file questions are similarly weak for vector-only configs** (62-69% recall@5): `c02` and `c03`
miss `model/User.js` (the schema is relevant but not what the question text resembles). Hybrid retrieves
it through a graph document that lists it.

**Graph-only retrieves nothing relevant for four questions:** `s02` (JWT verification), `s04` (DB
connection), `s08` (route prefixes) and `t08` (`jwt.verify`). None of them names a function or file
the graph knows about; `t08` asks about a library call that has no definition in the repo, which was
included deliberately as a hard case. The vector half of hybrid covers all four, which is the argument
for the ensemble.

**AST vs naive.** At k=10, naive recalls 96% and AST 81%. AST makes more, smaller chunks, so the same
number of documents spans fewer distinct files; the files it misses are the relationship files above.
AST has the best precision of the vector configs at k=5 (46% vs 40%). A file-level metric cannot show
whether a function was split mid-body, which is what AST chunking is for, so this result should not be
read as AST being worse. Why naive's coarse chunks do better on recall at k=10 was not tested.

## Threats to validity

- **One small repo, one author.** 15 files and 20 questions. Hit-rate is 100% for three configs because
  the corpus is small; only recall separates them. The questions were written knowing how the retrieval
  works, which could favor the graph configs.
- **Graph-friendly conventions.** Expecting the defining file, and counting every file a graph document
  lists, favor the graph configs. Hybrid retrieves 6.8 distinct files at k=5 vs 3.2 for AST-only, so its
  recall and precision are not like-for-like with the vector-only rows.
- **No tuning.** Ensemble weights (0.5 / 0.5), k, and chunk sizes (1000 / 100 for naive) were not tuned.
- **Name-based graph.** Same-named functions in different files are conflated.

## Answer quality and citations

Manual claim-by-claim review of 10 answers under two prompts (full notes and the rubric:
[`src/eval/answers/review.md`](../src/eval/answers/review.md)). The `legacy` prompt asks the model to
cite file paths; the `cited` prompt shows each retrieved block under `File: path (lines a-b)` and tells
the model to copy citations exactly and never invent them.

| | legacy | cited |
|---|---|---|
| Answers with no defect | 2 / 10 | 7 / 10 |
| Wrong file attributions | 4 | 0 |
| Wrong line claims | 4 (5 citations) | 0 |
| Wrong or invented details | 4 | 3 |
| Speculation | 3 | 3 |
| Omissions | 0 | 1 |
| Avg answer length | 874 chars | 650 chars |

- The automatic checker (`checkCitations.js`) confirms all 30 line citations in the cited answers are
  inside ranges the model was shown. It caught only 2 of 5 wrong legacy line citations: it verifies the
  range, not that the cited line is the right one, and it cannot see wrong file attributions.
- Part of the improvement is terseness (answers are ~26% shorter), with omissions as the cost.
- Caveats: 10 questions, one repo, one reviewer, one sample per question at default sampling
  temperature, so individual answers vary run to run. These 10 answers were generated before the
  chunker fix below; only `c01` was regenerated.

## The comment-chunk fix: before and after

The first AST chunker emitted comments as separate chunks: 14 of 64 chunks (22%) were comment-only.
This caused a real failure: for `c01` ("how does a request to create a post flow...") the chunk
`// 2 - Create a Post` was retrieved instead of the `createPost` function it describes, and the model
answered about comment creation instead. The chunker now attaches leading comments to the following
function or class.

| | Before | After |
|---|---|---|
| AST chunks | 64 | 50 |
| Comment-only chunks | 14 | 0 |
| Chunks under 60 chars | 21 | 7 |
| ast recall@5 / @10 | 80% / 81% | 80% / 81% |
| ast precision@5 / @10 | 54% / 33% | 46% / 28% |
| hybrid recall@5 / @10 | 99% / 99% | 99% / 99% |

- **Recall did not change**, so the hypothesis that comment chunks explained AST's lower recall was
  not supported. Precision and MRR dropped slightly, because the larger chunks pull in more distinct files
  of which the extra ones were not expected.
- **The fix did repair `c01`:** the regenerated answer (cited prompt) now describes the real flow with 3
  minor defects, against a wrong-topic answer with 6 defects before. One question, one sample.

## Reproduce

```bash
node src/cli.js index <path>/Social-Network-Backend social-network
node src/cli.js index <path>/Social-Network-Backend social-network-naive --chunker naive
npm run eval
node src/eval/generateAnswers.js --prompt cited   # slow on CPU
node src/eval/checkCitations.js
```
