import { pickParser } from "./chunkCode.js";

const FUNCTION_VALUE_TYPES = new Set(["arrow_function", "function_expression", "function"]);

function isFunctionLike(node) {
  return node && FUNCTION_VALUE_TYPES.has(node.type);
}

function stripQuotes(text) {
  return text.replace(/^['"`]|['"`]$/g, "");
}

// For `foo()` -> "foo"; for `a.b.c()` -> "c" (the property actually being invoked).
function getCalleeName(calleeNode) {
  if (!calleeNode) return null;
  if (calleeNode.type === "identifier") return calleeNode.text;
  if (calleeNode.type === "member_expression") {
    return calleeNode.childForFieldName("property")?.text ?? null;
  }
  return null;
}

/**
 * Depth-first walk of the whole file, collecting function/class-method
 * definitions, call/reference sites (including bare-identifier call
 * arguments, e.g. `router.get('/x', protect, handler)`), and imports.
 *
 * Unlike chunkCode.js (which only groups top-level statements for chunking
 * purposes), this walks every descendant node so nested references — calls
 * inside a function body, route wiring inside an inline callback, etc. —
 * are all captured.
 */
function walk(node, scope, out) {
  switch (node.type) {
    case "function_declaration":
    case "method_definition": {
      const name = node.childForFieldName("name")?.text;
      if (name) {
        out.functions.push({
          name,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        });
      }
      recurseChildren(node, name || scope, out);
      return;
    }

    case "variable_declarator": {
      const name = node.childForFieldName("name")?.text;
      const value = node.childForFieldName("value");
      if (name && isFunctionLike(value)) {
        out.functions.push({
          name,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        });
        recurseChildren(node, name, out);
        return;
      }
      break;
    }

    case "assignment_expression": {
      const left = node.childForFieldName("left");
      const right = node.childForFieldName("right");
      if (left?.type === "member_expression" && isFunctionLike(right)) {
        const objectText = left.childForFieldName("object")?.text;
        const propName = left.childForFieldName("property")?.text;
        if (propName && (objectText === "exports" || objectText === "module.exports")) {
          out.functions.push({
            name: propName,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
          });
          recurseChildren(node, propName, out);
          return;
        }
      }
      break;
    }

    case "import_statement": {
      const source = node.childForFieldName("source")?.text;
      if (source) out.imports.push({ source: stripQuotes(source) });
      break;
    }

    case "call_expression": {
      const calleeNode = node.childForFieldName("function");

      if (calleeNode?.type === "identifier" && calleeNode.text === "require") {
        const firstArg = node.childForFieldName("arguments")?.namedChild(0);
        if (firstArg?.type === "string") {
          out.imports.push({ source: stripQuotes(firstArg.text) });
        }
      } else {
        const calleeName = getCalleeName(calleeNode);
        if (calleeName) {
          out.references.push({
            name: calleeName,
            scope,
            line: node.startPosition.row + 1,
          });
        }
      }

      const argsNode = node.childForFieldName("arguments");
      if (argsNode) {
        for (const arg of argsNode.namedChildren) {
          if (arg.type === "identifier") {
            out.references.push({
              name: arg.text,
              scope,
              line: node.startPosition.row + 1,
            });
          }
        }
      }
      break;
    }
  }

  recurseChildren(node, scope, out);
}

function recurseChildren(node, scope, out) {
  for (const child of node.namedChildren) {
    walk(child, scope, out);
  }
}

/**
 * Extract function/class-method definitions, call/reference sites, and
 * imports from a single source file's AST.
 *
 * @param {string} content - raw source code
 * @param {string} [filePath] - used only to pick the JS/TS/TSX grammar
 * @returns {{ functions: {name:string,startLine:number,endLine:number}[], references: {name:string,scope:string,line:number}[], imports: {source:string}[] }}
 */
export function extractGraph(content, filePath = "") {
  const parser = pickParser(filePath);
  const tree = parser.parse(content);
  const out = { functions: [], references: [], imports: [] };
  walk(tree.rootNode, "<module>", out);
  return out;
}
