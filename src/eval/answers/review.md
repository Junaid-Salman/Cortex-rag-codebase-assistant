# Answer review — Phase 4C

Manual claim-by-claim review of 10 generated answers under two prompts, checked against the
source of `Social-Network-Backend`. Raw answers and the exact retrieved context are in
`answers-legacy.json` and `answers-cited.json`; the automatic checks come from
`node src/eval/checkCitations.js`.

- **legacy** — original prompt: "cite the file path for each claim".
- **cited** — new prompt: each context block is headed `File: path (lines a-b)`, with rules to copy
  paths/lines exactly and never invent them.
- Same model (`llama3.1:8b`, default sampling), same hybrid retrieval (k=5), same 10 questions. The
  retrieved context was identical for 9 of 10; `t08` had the same documents in a different order
  (tied similarity).

## Defect categories

| Code | Meaning |
|---|---|
| **WL** | wrong line number cited |
| **WA** | claim attributed to the wrong file |
| **WD** | wrong or invented detail (a path, a message, an import specifier, an implementation) |
| **SP** | unsupported speculation ("likely", "probably defined elsewhere") |
| **OM** | omission of something the context contained |
| **OQ** | did not answer the question asked (retrieval failure upstream) |

## Per-answer results

| id | legacy defects | cited defects |
|---|---|---|
| s02 | **WL**: says `jwt.verify` is at "line 10"; it is line 11 | none |
| s03 | **WA** x2: credits `model/User.js` for `findOne` and for `bcrypt.compare` (both are in `authController.js`; the `pre('save')` hook it names is the hashing code) | none |
| s06 | **WA** x2: credits `model/Post.js` for `Post.findById` and `.save()`; **WD**: says the error message mentions "edit" (the code's message says "delete") | **WD**: same "edit" vs "delete" message detail |
| t01 | none (lists all 20 call sites, copied from the graph document) | **OM**: lists 4 of the 5 `postRoutes.js` call sites (drops line 26) |
| t03 | none | none |
| t06 | **WD** x3: invents import specifiers `./../model/User` (`Comment.js`, `Post.js`) and `../model/User` (`FollowRequest.js`); the real ones are `./User`. The file list itself is correct (10/10) | none (10/10 files, no specifiers) |
| t08 | **WL**: "line 9" (cited twice); it is line 11 | none |
| c01 | **OQ**, **SP**: `createPost` was never retrieved, so it answers about comment creation instead and speculates | **OQ**, **SP** x3, **WD** x2: invents a `/post` route (real: `/createPost`) and says `model/Post.js` implements `Model.find()`/`Model.create()` (it is a schema) |
| c02 | **SP**: "private accounts likely handled elsewhere" | none |
| c04 | **WL** x2: "lines 1-12" and "lines 4-13" (real: 5-16 and 85); **SP** | none |

## Summary

| | legacy | cited |
|---|---|---|
| Answers with no defect | 2 / 10 | 7 / 10 |
| Total defects | 16 | 8 |
| ...of which `c01` (retrieval failure, same in both) | 2 | 6 |
| Total excluding `c01` | 14 | 2 |
| Wrong file attributions (WA) | 4 | 0 |
| Wrong line claims (WL) | 4 (5 citations) | 0 |
| Wrong/invented details (WD) | 4 | 3 |
| Speculation (SP) | 3 | 3 |
| Omissions (OM) | 0 | 1 |

### Automatic checker vs. manual review

| | legacy | cited |
|---|---|---|
| Line citations counted by the checker | 26 | 30 |
| Flagged invalid by the checker | 2 (both in `c04`) | 0 |
| Wrong line citations found manually | 5 | 0 |
| Invented file paths (checker) | 0 | 0 |

The checker confirms the cited prompt's 30 line citations are all correct. On the legacy answers it
caught 2 of the 5 wrong line citations: it only verifies a line falls inside a range the model was
shown, so "line 10" for something on line 11 passes. It also cannot see wrong file attributions or
wrong details. It is a cheap floor, not a substitute for the manual review.

## Caveats

- **One sample per question** at default (non-zero) temperature. The earlier CLI run of `t01` dropped
  `likeRoutes.js` while the legacy review run did not, so individual answers vary run to run.
- **10 questions, one repo, one reviewer** (the model assisting the user). Treat the counts as
  directional, not statistically significant.
- **Cited answers are shorter** (avg 650 chars vs 874), so there were fewer claims to get wrong.
  Part of the improvement may be terseness, not better grounding. The cost shows up as omissions
  (`t01`) and thinner explanations (`s06`, `t08` is just a path).
- **Time is not comparable:** legacy averaged 135s and cited 288s per answer, but the cited run
  overlapped with other work on the same CPU-only machine.
- **`c01` is a retrieval failure, not a prompt effect.** The AST chunker emitted `// 2 - Create a Post`
  as its own chunk (lines 21-22) and the real `createPost` function (lines 23-41) was not in the top 5.
  Prompting cannot fix missing context.

## For you to spot-check

These are the judgment calls most worth a second look:

1. `s06` (both prompts): I counted "not authorized to **edit**" as a wrong detail because the code's
   message reads "...to **delete** post!" (a copy-paste in `postController.js:71`). You may consider it
   a fair paraphrase of the intent.
2. `c02` (cited): it says results are "combined into an array of posts". The code's variable is named
   `combinedPosts` but actually holds users. I counted it as no defect because the answer follows the
   code's own naming.
3. `t01` (cited): dropping line 26 is counted as an omission, not a hallucination.
4. `s03` (legacy): crediting `model/User.js` for `findOne`. I counted it as a wrong attribution because
   `findOne` is called in `authController.js`, even though `User` is the model it is called on.
5. `c01` (cited): I counted 6 defects; a stricter reviewer might merge them into a single "failed answer".

## Addendum — `c01` after the comment-chunk fix

Regenerated with the `cited` prompt against the rebuilt 50-chunk AST index
(`answers-cited-postfix.json`; the other nine answers above were not regenerated).
`createPost` (lines 21-41, leading comment attached) is now in the retrieved context.

| | before the fix (cited) | after the fix (cited) |
|---|---|---|
| Answers the question asked | no (described comment creation / speculated) | yes |
| Defects | OQ, SP x3, WD x2 (6) | SP x1 ("we can infer `postRoutes.js`"), WD x1 (`/posts` vs `/posts/createPost`), OM x1 (no mention of `protect`) (3) |
| Line citations | 1, valid | 2, both valid |
| Expected files cited | 3/4 | 3/4 |
| Generation time | 509s | 121s (the earlier run overlapped with other CPU work) |

One sample; a retrieval fix cannot guarantee a better answer, but here the missing context was the cause.
