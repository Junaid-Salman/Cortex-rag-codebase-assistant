import test from "node:test";
import assert from "node:assert/strict";
import { Document } from "@langchain/core/documents";
import { withLocation } from "./citations.js";

test("withLocation renders a line range", () => {
  const d = withLocation(new Document({ pageContent: "x", metadata: { source: "a.js", startLine: 3, endLine: 18 } }));
  assert.equal(d.metadata.location, " (lines 3-18)");
  assert.equal(d.metadata.source, "a.js");
});

test("withLocation renders a single line", () => {
  const d = withLocation(new Document({ pageContent: "x", metadata: { startLine: 20, endLine: 20 } }));
  assert.equal(d.metadata.location, " (line 20)");
});

test("withLocation is empty when there is no range (graph file documents)", () => {
  const d = withLocation(new Document({ pageContent: "x", metadata: { source: "a.js", files: ["a.js"] } }));
  assert.equal(d.metadata.location, "");
});

test("withLocation does not mutate its input", () => {
  const original = new Document({ pageContent: "x", metadata: { startLine: 1, endLine: 2 } });
  withLocation(original);
  assert.equal(original.metadata.location, undefined);
});
