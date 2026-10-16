import { Document } from "@langchain/core/documents";

/**
 * Add a `location` label to a retrieved document's metadata so the document
 * prompt can always render "File: <path><location>" -- LangChain's prompt
 * templates throw on missing variables, and not every document has a line
 * range (e.g. graph documents describing a file's imports).
 *
 * @param {Document} doc
 * @returns {Document} a copy with metadata.location = " (lines a-b)" or ""
 */
export function withLocation(doc) {
  const { startLine, endLine } = doc.metadata ?? {};
  let location = "";
  if (Number.isInteger(startLine) && Number.isInteger(endLine)) {
    location = startLine === endLine ? ` (line ${startLine})` : ` (lines ${startLine}-${endLine})`;
  }
  return new Document({
    pageContent: doc.pageContent,
    metadata: { ...doc.metadata, location },
  });
}
