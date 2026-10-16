import { ChatPromptTemplate, PromptTemplate } from "@langchain/core/prompts";

/**
 * Prompt variants. `legacy` is the pre-4C prompt (file paths only), kept so
 * the answer review can compare invented-citation rates before and after.
 */
export const PROMPT_VERSIONS = ["legacy", "cited"];

const LEGACY_PROMPT = `
You are a helpful assistant answering questions about a codebase.
Use only the code context below to answer. If the answer isn't in the context, say so.
Cite the file path for each claim you make.

Context:
{context}

Question: {input}
`;

const CITED_PROMPT = `
You are a helpful assistant answering questions about a codebase.
Use only the code context below to answer. If the answer isn't in the context, say so.

Each block of context starts with a header like "File: path/to/file.js (lines 3-18)".

Citation rules:
- Cite sources as: path/to/file.js (lines 3-18). Copy the path and line numbers exactly as they appear in a header, or use line numbers that are written in the context text itself.
- Never invent or guess a file path or a line number. If a header has no line range, cite only the file path.
- Do not mention files or functions that do not appear in the context.

Context:
{context}

Question: {input}
`;

/**
 * @param {"legacy" | "cited"} version
 * @returns {{ prompt: ChatPromptTemplate, documentPrompt: PromptTemplate }}
 */
export function getPrompts(version = "cited") {
  if (!PROMPT_VERSIONS.includes(version)) {
    throw new Error(`Unknown prompt version "${version}" (expected ${PROMPT_VERSIONS.join(" | ")})`);
  }

  // createStuffDocumentsChain only stuffs each chunk's pageContent into
  // {context}; the document prompt is what carries metadata (path, and for
  // "cited", the line range via metadata.location) to the model.
  if (version === "legacy") {
    return {
      prompt: ChatPromptTemplate.fromTemplate(LEGACY_PROMPT),
      documentPrompt: PromptTemplate.fromTemplate("File: {source}\n{page_content}"),
    };
  }
  return {
    prompt: ChatPromptTemplate.fromTemplate(CITED_PROMPT),
    documentPrompt: PromptTemplate.fromTemplate("File: {source}{location}\n{page_content}"),
  };
}
