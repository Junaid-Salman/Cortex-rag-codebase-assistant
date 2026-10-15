import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";

const jsParser = new Parser();
jsParser.setLanguage(JavaScript);

const tsParser = new Parser();
tsParser.setLanguage(TypeScript.typescript);

const tsxParser = new Parser();
tsxParser.setLanguage(TypeScript.tsx);

// Top-level statement types that count as "complex" (function/class-bearing)
// on their own, regardless of what they contain.
const ALWAYS_COMPLEX_TYPES = new Set(["function_declaration", "class_declaration"]);

// Statement types that are only "complex" if their text actually contains a
// function/class — e.g. `const handler = () => {...}` or
// `app.post('/x', (req, res) => {...})`, but not `const PORT = 8080;`.
const CONDITIONALLY_COMPLEX_TYPES = new Set([
  "lexical_declaration",
  "variable_declaration",
  "expression_statement",
  "export_statement",
]);

function looksLikeFunctionOrClass(text) {
  return /=>|\bclass\s|\bfunction\b/.test(text);
}

export function pickParser(filePath) {
  if (filePath.endsWith(".tsx")) return tsxParser;
  if (filePath.endsWith(".ts")) return tsParser;
  return jsParser;
}

/**
 * Chunk a flat list of sibling statement nodes (e.g. a program body or a
 * class body). Consecutive "simple" statements (imports, const primitives,
 * middleware registration, etc.) are grouped into a single setup chunk so
 * they aren't lost, while function/class-bearing statements each become
 * their own chunk.
 */
function chunkStatements(nodes) {
  const chunks = [];
  let buffer = [];
  let bufferStart = null;

  function flushBuffer(endLine) {
    if (buffer.length === 0) return;
    chunks.push({
      text: buffer.map((n) => n.text).join("\n"),
      type: "setup",
      startLine: bufferStart,
      endLine,
    });
    buffer = [];
    bufferStart = null;
  }

  for (const node of nodes) {
    const text = node.text.trim();
    if (!text) continue;

    if (node.type === "class_declaration") {
      flushBuffer(node.startPosition.row);
      chunks.push(...chunkClass(node));
      continue;
    }

    const isComplex =
      ALWAYS_COMPLEX_TYPES.has(node.type) ||
      (CONDITIONALLY_COMPLEX_TYPES.has(node.type) && looksLikeFunctionOrClass(text));

    if (isComplex) {
      flushBuffer(node.startPosition.row);
      chunks.push({
        text: node.text,
        type: node.type,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      });
    } else {
      if (bufferStart === null) bufferStart = node.startPosition.row + 1;
      buffer.push(node);
    }
  }

  flushBuffer(
    nodes.length ? nodes[nodes.length - 1].endPosition.row + 1 : 1,
  );

  return chunks;
}

/**
 * Break a class into one chunk per method so large classes don't become a
 * single monolithic chunk. Falls back to the whole class if it has no
 * methods (e.g. a plain data class).
 */
function chunkClass(classNode) {
  const nameNode = classNode.childForFieldName("name");
  const className = nameNode ? nameNode.text : "AnonymousClass";
  const bodyNode = classNode.children.find((c) => c.type === "class_body");
  const methods = bodyNode
    ? bodyNode.children.filter((c) => c.type === "method_definition")
    : [];

  if (methods.length === 0) {
    return [
      {
        text: classNode.text,
        type: "class_declaration",
        startLine: classNode.startPosition.row + 1,
        endLine: classNode.endPosition.row + 1,
      },
    ];
  }

  return methods.map((method) => ({
    text: method.text,
    type: "method_definition",
    className,
    startLine: method.startPosition.row + 1,
    endLine: method.endPosition.row + 1,
  }));
}

/**
 * Parse a source file's content and return an array of code chunks aligned
 * to top-level statement boundaries: functions, classes (broken into
 * per-method chunks), and grouped non-function setup code (imports,
 * constants, middleware registration, etc.).
 *
 * @param {string} content - raw source code
 * @param {string} [filePath] - used only to pick the JS/TS/TSX grammar
 * @returns {{ text: string, type: string, startLine: number, endLine: number }[]}
 */
export function chunkCode(content, filePath = "") {
  const parser = pickParser(filePath);
  const tree = parser.parse(content);
  const chunks = chunkStatements(tree.rootNode.children);

  // Fallback: if nothing was found at all (e.g. an empty file), keep the
  // whole content as one chunk so we don't lose it.
  if (chunks.length === 0) {
    chunks.push({
      text: content,
      type: "whole_file",
      startLine: 1,
      endLine: content.split("\n").length,
    });
  }

  return chunks;
}
