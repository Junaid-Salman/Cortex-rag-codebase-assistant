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
 *
 * Comments are kept with the code they describe: comments directly above a
 * function/class are folded into that chunk (so a "// Create a Post" header
 * never becomes a tiny comment-only chunk that wastes a retrieval slot), and
 * a comment on the same line as a statement stays with that statement.
 *
 * @param {import("tree-sitter").SyntaxNode[]} nodes - sibling nodes
 * @param {string} content - the full source, used to slice contiguous chunk text
 */
function chunkStatements(nodes, content) {
  const chunks = [];
  let buffer = [];
  let bufferStart = null;
  let bufferEnd = null;
  // Comments seen since the last statement; they join whatever comes next.
  let pending = [];
  let prev = null; // previous statement/comment node, to detect same-line trailing comments

  function flushBuffer() {
    if (buffer.length === 0) return;
    chunks.push({
      text: buffer.map((n) => n.text).join("\n"),
      type: "setup",
      startLine: bufferStart,
      endLine: bufferEnd,
    });
    buffer = [];
    bufferStart = null;
    bufferEnd = null;
  }

  function pushToBuffer(node) {
    if (bufferStart === null) bufferStart = node.startPosition.row + 1;
    buffer.push(node);
    bufferEnd = node.endPosition.row + 1;
  }

  function releasePendingToBuffer() {
    pending.forEach(pushToBuffer);
    pending = [];
  }

  for (const node of nodes) {
    const text = node.text.trim();
    if (!text) continue;

    if (node.type === "comment") {
      const trailing = prev && prev.endPosition.row === node.startPosition.row;
      if (trailing) {
        // `foo(); // note` -- stays with `foo();`
        const last = chunks[chunks.length - 1];
        if (buffer.length > 0 && buffer[buffer.length - 1] === prev) {
          pushToBuffer(node);
        } else if (last && last.endLine === node.endPosition.row + 1 && pending.length === 0) {
          last.text += ` ${node.text}`;
        } else {
          pending.push(node);
        }
      } else {
        pending.push(node);
      }
      prev = node;
      continue;
    }

    const isClass = node.type === "class_declaration";
    const isComplex =
      isClass ||
      ALWAYS_COMPLEX_TYPES.has(node.type) ||
      (CONDITIONALLY_COMPLEX_TYPES.has(node.type) && looksLikeFunctionOrClass(text));

    if (!isComplex) {
      releasePendingToBuffer();
      pushToBuffer(node);
      prev = node;
      continue;
    }

    flushBuffer();
    // Contiguous source from the first leading comment (if any) to the end
    // of the statement, so blank lines/comments between them are preserved.
    const first = pending.length ? pending[0] : node;
    const startIndex = first.startIndex;
    const startLine = first.startPosition.row + 1;
    const leading = pending;
    pending = [];

    if (isClass) {
      chunks.push(...chunkClass(node, leading.length ? { startIndex, startLine, content } : null));
    } else {
      chunks.push({
        text: leading.length ? content.slice(startIndex, node.endIndex) : node.text,
        type: node.type,
        startLine,
        endLine: node.endPosition.row + 1,
      });
    }
    prev = node;
  }

  // Trailing comments with nothing after them belong to the setup group.
  releasePendingToBuffer();
  flushBuffer();

  return chunks;
}

/**
 * Break a class into one chunk per method so large classes don't become a
 * single monolithic chunk. Falls back to the whole class if it has no
 * methods (e.g. a plain data class).
 */
function chunkClass(classNode, leading = null) {
  const nameNode = classNode.childForFieldName("name");
  const className = nameNode ? nameNode.text : "AnonymousClass";
  const bodyNode = classNode.children.find((c) => c.type === "class_body");
  const methods = bodyNode
    ? bodyNode.children.filter((c) => c.type === "method_definition")
    : [];

  if (methods.length === 0) {
    return [
      {
        text: leading ? leading.content.slice(leading.startIndex, classNode.endIndex) : classNode.text,
        type: "class_declaration",
        startLine: leading ? leading.startLine : classNode.startPosition.row + 1,
        endLine: classNode.endPosition.row + 1,
      },
    ];
  }

  return methods.map((method, i) => {
    // Comments above the class go with its first method.
    const withLeading = leading && i === 0;
    return {
      text: withLeading ? leading.content.slice(leading.startIndex, method.endIndex) : method.text,
      type: "method_definition",
      className,
      startLine: withLeading ? leading.startLine : method.startPosition.row + 1,
      endLine: method.endPosition.row + 1,
    };
  });
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
  const chunks = chunkStatements(tree.rootNode.children, content);

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
