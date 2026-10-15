# Phase 3 — Hybrid Retrieval (Vector + Code Graph)

**Test repo:** `Social-Network-Backend` (15 JS files, Express/CommonJS, indexed as `social-network`: 64 chunks, 407 graph rows).
**Method:** For each question, compare what the vector-only retriever (`k=5`) returns with what the `GraphRetriever` returns, then run the full hybrid chain (`EnsembleRetriever`, weights 0.5/0.5, `llama3.1:8b`).

## Retrieval: vector-only vs. graph

| Question | Vector-only top-5 | Graph retriever | Verdict |
|---|---|---|---|
| Which route files use the `protect` middleware? | `authMiddleware.js`, `commentRoutes.js` x2, `likeRoutes.js` x2 — misses `followRoutes.js`, `postRoutes.js` | Definition + all 20 call sites across comment/follow/like/post routes | Graph complete, vector incomplete |
| What calls the `protect` function? | `authMiddleware.js` x2, `likeRoutes`, `commentRoutes`, `model/User.js` (irrelevant) | Same complete list as above | Graph clearly better |
| What does `routes/followRoutes.js` import? | 5 files, `followRoutes.js` ranked 4th, mixed with unrelated files | Exactly that file's imports + importers (`server.js`) | Graph clearly better |
| Where is `followById` used? | 5 chunks, all from `followController.js` — the route wiring in `followRoutes.js` never appears | Definition (`followController.js`, 67-83) + usage (`followRoutes.js`, line 20) | Graph clearly better |
| How does password hashing work? (semantic) | n/a (vector path) | `[]` — graph stays out of the way | Correct |
| How does a user log in and get authenticated? (semantic, full chain) | n/a | n/a | Correct, grounded answer via vector path |

## End-to-end chain

Structural questions are now answered with correct files and call sites. Semantic questions did not regress.

## Issues found and fixed

- **File-name over-matching.** The original tokenizer split `routes/followRoutes.js` into `routes`, `followRoutes`, `js`, and substring matching made `routes` match every route file. Fixed in `graphRetriever.js`: explicit paths match exactly (or by path suffix), plain tokens match a file's basename exactly.

## Known limitations

- The LLM still invents details the context doesn't contain (e.g. "at lines 3 and 4" for imports, which the graph doesn't record line numbers for). Citation/hallucination review belongs to Phase 4.2.
- "Imported by" resolution matches on basename, so two files with the same name in different folders would collide.
- The graph retriever loads every `code_graph` row for the repo on each query. Fine at this scale; filter in SQL for large repos.
- Call/reference extraction is name-based (`foo()` and `a.b.foo()` both record `foo`), so same-named functions in different files are not distinguished.
