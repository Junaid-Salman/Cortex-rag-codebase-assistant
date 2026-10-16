import test from "node:test";
import assert from "node:assert/strict";
import { chunkCode } from "./chunkCode.js";

const isCommentOnly = (text) => text.trim().split("\n").every((l) => /^\s*(\/\/|\/\*|\*|$)/.test(l));

test("leading comment is folded into the function chunk (the c01 case)", () => {
  const src = [
    "const a = 1;",
    "",
    "// 2 - Create a Post",
    "",
    "exports.createPost = async (req, res) => {",
    "  res.send('ok');",
    "}",
  ].join("\n");
  const chunks = chunkCode(src, "x.js");
  const fn = chunks.find((c) => c.text.includes("createPost"));
  assert.ok(fn.text.startsWith("// 2 - Create a Post"));
  assert.equal(fn.startLine, 3);
  assert.equal(fn.endLine, 7);
  assert.equal(chunks.filter((c) => isCommentOnly(c.text)).length, 0);
  assert.equal(chunks[0].text, "const a = 1;");
  assert.equal(chunks[0].endLine, 1);
});

test("multi-line and block comments above a function all attach", () => {
  const src = "// one\n// two\n/** doc */\nfunction f() { return 1; }";
  const [c] = chunkCode(src, "x.js");
  assert.equal(c.text, src);
  assert.equal(c.startLine, 1);
});

test("comment above a simple statement stays in the setup chunk, not a chunk of its own", () => {
  const src = "// the port\nconst PORT = 8000;\nfunction f() { return 1; }";
  const chunks = chunkCode(src, "x.js");
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].type, "setup");
  assert.equal(chunks[0].text, "// the port\nconst PORT = 8000;");
  assert.equal(chunks[1].text, "function f() { return 1; }");
});

test("same-line trailing comment stays with its statement, not the next function", () => {
  const src = "const a = 1; // trailing\nfunction f() { return 1; }";
  const chunks = chunkCode(src, "x.js");
  assert.equal(chunks[0].text, "const a = 1;\n// trailing");
  assert.equal(chunks[1].text, "function f() { return 1; }");
});

test("trailing comment on the same line as a function stays in that chunk", () => {
  const src = "function f() { return 1; } // done\nfunction g() { return 2; }";
  const chunks = chunkCode(src, "x.js");
  assert.equal(chunks.length, 2);
  assert.ok(chunks[0].text.includes("// done"));
  assert.equal(chunks[1].text, "function g() { return 2; }");
});

test("comments at the end of the file go to the setup group", () => {
  const src = "function f() { return 1; }\n// the end";
  const chunks = chunkCode(src, "x.js");
  assert.equal(chunks.length, 2);
  assert.equal(chunks[1].type, "setup");
  assert.equal(chunks[1].text, "// the end");
});

test("commented-out code before a function attaches to it", () => {
  const src = "// router.get('/old', handler);\nfunction f() { return 1; }";
  const [c] = chunkCode(src, "x.js");
  assert.equal(c.text, src);
});

test("class: leading comment attaches to the first method; lines are right", () => {
  const src = "// the class\nclass A {\n  m1() { return 1; }\n  m2() { return 2; }\n}";
  const chunks = chunkCode(src, "x.js");
  assert.equal(chunks.length, 2);
  assert.ok(chunks[0].text.startsWith("// the class"));
  assert.equal(chunks[0].startLine, 1);
  assert.equal(chunks[1].text, "m2() { return 2; }");
});

test("non-ASCII text before a function does not shift the slice", () => {
  const src = "// héllo 🙂 wörld\nfunction f() { return 'ü'; }";
  const [c] = chunkCode(src, "x.js");
  assert.equal(c.text, src);
});

test("setup chunk end line is the last statement's line, not the next function's", () => {
  const src = "const a = 1;\nconst b = 2;\n\n\nfunction f() { return 1; }";
  const chunks = chunkCode(src, "x.js");
  assert.equal(chunks[0].startLine, 1);
  assert.equal(chunks[0].endLine, 2);
  assert.equal(chunks[1].startLine, 5);
});

test("no comment-only chunks on a realistic Express controller", () => {
  const src = [
    "const express = require('express');",
    "// 1 - Get all",
    "exports.getAll = async (req, res) => {",
    "  res.json([]);",
    "}",
    "",
    "// 2 - Get one",
    "exports.getOne = async (req, res) => {",
    "  res.json({});",
    "}",
  ].join("\n");
  const chunks = chunkCode(src, "x.js");
  assert.equal(chunks.filter((c) => isCommentOnly(c.text)).length, 0);
  assert.equal(chunks.length, 3);
});

test("empty file still falls back to a whole_file chunk", () => {
  assert.equal(chunkCode("", "x.js")[0].type, "whole_file");
});
