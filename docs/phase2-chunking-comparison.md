# Phase 2 — Naive vs. AST-Aware Chunking: Comparison

**Test repo:** `PusherNotification` (single-file Express + Pusher app, `app.js`, ~35 lines)
**Method:** Same repo indexed twice under separate Supabase tags — `test-repo-naive` (`RecursiveCharacterTextSplitter`, chunk size 1000 / overlap 100) and `test-repo-ast` (tree-sitter AST chunking) — then the same 5 fixed questions asked against each, `k=5` retrieval, `llama3.1:8b` generation.

## Chunking output

| Strategy | Chunks produced |
|---|---|
| Naive | 1 (whole file fits under the 1000-char limit) |
| AST-aware | 4 — `setup` (imports/const/middleware registration), `app.get('/notifications', ...)`, `app.post('/send-notification', ...)`, `app.listen(...)` |

Note: an earlier version of `chunkCode.js` only matched `function_declaration` / `class_declaration` / assigned `const fn = () => {}` patterns. This repo's actual logic is inline arrow-function callbacks passed to `app.get()` / `app.post()` / `app.listen()` — a very common Express/Fastify pattern — which that version didn't match at all, so it silently fell back to treating the whole file as one chunk (identical to the naive result). Fixed by chunking at top-level-statement granularity instead (see `src/ingest/chunkCode.js`): function/class-bearing statements each become their own chunk, and consecutive non-function statements (imports, constants, middleware setup) are grouped into a `setup` chunk.

## Results

| # | Question | AST answer | Naive answer | Verdict |
|---|---|---|---|---|
| 1 | What does this codebase do? | Correct summary; omitted middleware detail; guessed file path `/server.js` (wrong) | Correct summary; included middleware detail; correctly cited `app.js` | Naive slightly better |
| 2 | How is the Express server configured, and what middleware does it use? | Correct middleware list with fabricated line numbers; wrong file path `./server.js` | Correct middleware list, concise; hedged file path honestly ("assumed") | Roughly even |
| 3 | What happens on POST `/send-notification`? | Correct, precise step-by-step | Correct; added a genuinely useful observation (no error handling) not asked for | Naive slightly better |
| 4 | What Pusher event/channel is triggered? | Correct (`new-message` / `notifications`); fabricated file path `/routes/http.js` (doesn't exist) | Correct; included the actual code snippet for verification | Naive slightly better |
| 5 | What port does it listen on and how? | Correct | Correct | Even |

## Conclusion

**Inconclusive on retrieval quality, and that's itself the finding.** With `k=5` and only 1 (naive) or 4 (AST) chunks total, both retrievers return effectively the entire file's content regardless of question — so this test never exercised the actual failure mode AST-aware chunking exists to prevent (naive splitting cutting a function in half mid-body, or capping semantic relevance to whichever 1000-char window happens to match). **To get a real signal, this comparison needs to be re-run against a larger repo** — one where `RecursiveCharacterTextSplitter` at chunk size 1000 would actually split a function or class across chunk boundaries, and where the corpus is bigger than `k` so retrieval recall is actually being tested.

**Separate, confirmed defect (affects both strategies equally):** every file-path citation in every answer was hallucinated — `/server.js`, `./server.js`, `/routes/http.js`, `./` — despite the actual file being `app.js`. This isn't a chunking problem; `qaChain.js`'s `createStuffDocumentsChain` only feeds the LLM each chunk's `pageContent`, never `metadata.source` or line numbers, so the model is guessing filenames from convention. This blocks Phase 4's citation requirement and should be fixed by threading `metadata.source`/`startLine`/`endLine` into the prompt context.
