import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAnswer, resolveFile, allowedRanges } from "./citationCheck.js";

const repoFiles = ["server.js", "routes/likeRoutes.js", "routes/postRoutes.js", "middleware/authMiddleware.js"];

const context = [
  { source: "middleware/authMiddleware.js", startLine: 3, endLine: 18, files: null, text: "const protect..." },
  { source: "routes/likeRoutes.js", startLine: 82, endLine: 93, files: null, text: "router.get..." },
  {
    source: "middleware/authMiddleware.js",
    startLine: 3,
    endLine: 18,
    files: ["middleware/authMiddleware.js", "routes/postRoutes.js"],
    text:
      "Function `protect` is defined in middleware/authMiddleware.js (lines 3-18).\nReferenced/called at:\n" +
      "- routes/postRoutes.js (module scope, line 14)\n- routes/postRoutes.js (module scope, line 17)",
  },
];

test("resolveFile: exact, suffix, and nonexistent", () => {
  assert.equal(resolveFile("routes/likeRoutes.js", repoFiles), "routes/likeRoutes.js");
  assert.equal(resolveFile("./routes/likeRoutes.js", repoFiles), "routes/likeRoutes.js");
  assert.equal(resolveFile("likeRoutes.js", repoFiles), "routes/likeRoutes.js");
  assert.equal(resolveFile("/routes/http.js", repoFiles), null);
});

test("allowedRanges reads chunk headers and graph text", () => {
  const r = allowedRanges(context);
  assert.deepEqual(r.get("routes/postRoutes.js"), [[14, 14], [17, 17]]);
  assert.ok(r.get("middleware/authMiddleware.js").some(([a, b]) => a === 3 && b === 18));
});

test("valid citations pass", () => {
  const out = analyzeAnswer({
    answer: "The protect middleware (middleware/authMiddleware.js, lines 3-18) is used in routes/postRoutes.js (lines 14 and 17).",
    context,
    repoFiles,
  });
  assert.equal(out.lineCites.length, 3);
  assert.equal(out.invalidLineCites.length, 0);
  assert.deepEqual(out.nonexistentFiles, []);
});

test("invented path and invented lines are flagged", () => {
  const out = analyzeAnswer({
    answer: "See /routes/http.js. Also routes/likeRoutes.js at lines 3 and 4.",
    context,
    repoFiles,
  });
  assert.deepEqual(out.nonexistentFiles, ["/routes/http.js"]);
  assert.equal(out.invalidLineCites.length, 2); // 3 and 4 are outside 82-93
});

test("file that exists but was not retrieved is ungrounded", () => {
  const out = analyzeAnswer({ answer: "It is in server.js.", context, repoFiles });
  assert.deepEqual(out.ungroundedFiles, ["server.js"]);
});

test("line list with 'and' and a trailing comma-and form", () => {
  const out = analyzeAnswer({
    answer: "routes/postRoutes.js is used at lines 14, 17, and 99.",
    context,
    repoFiles,
  });
  assert.equal(out.lineCites.length, 3);
  assert.equal(out.invalidLineCites.length, 1);
  assert.equal(out.invalidLineCites[0].a, 99);
});

test("technology names like Node.js are not file citations", () => {
  const out = analyzeAnswer({ answer: "This runs on Node.js and Express.js.", context, repoFiles });
  assert.equal(out.files.length, 0);
});

test("line numbers with no file anywhere are unattributed", () => {
  const out = analyzeAnswer({ answer: "It happens at line 5.", context, repoFiles });
  assert.equal(out.unattributedLineCites, 1);
});

test("expected-file coverage", () => {
  const out = analyzeAnswer({
    answer: "Used in routes/postRoutes.js only.",
    context,
    repoFiles,
    expectedFiles: ["routes/postRoutes.js", "routes/likeRoutes.js"],
  });
  assert.equal(out.expectedFilesCited, 1);
  assert.equal(out.expectedFilesTotal, 2);
});
