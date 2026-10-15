import test from "node:test";
import assert from "node:assert/strict";
import { distinctFiles, scoreQuestion, aggregate } from "./metrics.js";

test("distinctFiles keeps rank order and dedupes", () => {
  const docs = [
    { metadata: { source: "a.js" } },
    { metadata: { source: "b.js" } },
    { metadata: { source: "a.js" } },
  ];
  assert.deepEqual(distinctFiles(docs), ["a.js", "b.js"]);
});

test("distinctFiles expands graph docs via metadata.files", () => {
  const docs = [
    { metadata: { source: "def.js", files: ["def.js", "x.js", "y.js"] } },
    { metadata: { source: "x.js" } },
  ];
  assert.deepEqual(distinctFiles(docs), ["def.js", "x.js", "y.js"]);
});

test("scoreQuestion: partial hit", () => {
  const s = scoreQuestion(["a.js", "b.js", "c.js", "d.js"], ["b.js", "z.js"]);
  assert.equal(s.hit, 1);
  assert.equal(s.recall, 0.5);
  assert.equal(s.precision, 0.25);
  assert.equal(s.rr, 0.5);
});

test("scoreQuestion: a wrong expected file is a miss (harness sanity check)", () => {
  const s = scoreQuestion(["a.js", "b.js"], ["nope.js"]);
  assert.deepEqual(s, { hit: 0, recall: 0, precision: 0, rr: 0 });
});

test("scoreQuestion: nothing retrieved", () => {
  assert.deepEqual(scoreQuestion([], ["a.js"]), { hit: 0, recall: 0, precision: 0, rr: 0 });
});

test("aggregate averages", () => {
  const agg = aggregate([
    { hit: 1, recall: 1, precision: 0.5, rr: 1 },
    { hit: 0, recall: 0, precision: 0, rr: 0 },
  ]);
  assert.deepEqual(agg, { n: 2, hit: 0.5, recall: 0.5, precision: 0.25, mrr: 0.5 });
});
