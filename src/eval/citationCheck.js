/**
 * Deterministic citation checks for generated answers. No LLM involved.
 *
 * For every file path and line number an answer cites, check that
 *   1. the file exists in the repo            (else: invented path)
 *   2. the file was in the retrieved context  (else: ungrounded)
 *   3. cited lines fall inside a range the model was actually shown
 *      for that file                          (else: invented/wrong line)
 *
 * This catches wrong paths and wrong lines. It cannot judge whether a prose
 * claim is true -- that is the manual part of the review.
 */

const FILE_TOKEN = /[\w@.\/-]*[\w-]+\.(?:js|jsx|ts|tsx|mjs|cjs)\b/g;
// "Node.js", "Express.js" etc. are technology names, not file paths.
const NOT_FILES = new Set(["node.js", "express.js", "react.js", "vue.js", "next.js", "nest.js"]);
const LINE_MENTION = /\blines?\s+(\d+)(?:\s*[-–]\s*(\d+))?((?:\s*(?:,\s*and|,|and|&)\s*\d+)*)/gi;

function normalize(token) {
  return token.replace(/^[./]+/, "").replace(/^\/+/, "");
}

/**
 * Resolve a file token from answer text to a repo-relative path.
 * @returns {string | null} null when no repo file matches
 */
export function resolveFile(token, repoFiles) {
  const t = normalize(token);
  if (repoFiles.includes(t)) return t;
  const bySuffix = repoFiles.filter((f) => f.endsWith(`/${t}`));
  if (bySuffix.length >= 1) return bySuffix[0];
  return null;
}

/**
 * Line ranges the model was shown, per file: chunk header ranges plus the
 * individual lines/ranges written inside graph documents.
 * @param {{ source: string, startLine: number|null, endLine: number|null, files: string[]|null, text: string }[]} context
 * @returns {Map<string, [number, number][]>}
 */
export function allowedRanges(context) {
  const ranges = new Map();
  const add = (file, a, b) => {
    if (!ranges.has(file)) ranges.set(file, []);
    ranges.get(file).push([a, b]);
  };

  for (const doc of context) {
    if (Number.isInteger(doc.startLine) && Number.isInteger(doc.endLine)) {
      add(doc.source, doc.startLine, doc.endLine);
    }
    if (doc.files) {
      // graph documents spell out lines in their text
      for (const m of doc.text.matchAll(/^- (\S+) \([^)]*?line (\d+)\)/gm)) add(m[1], +m[2], +m[2]);
      for (const m of doc.text.matchAll(/defined in (\S+) \(lines (\d+)-(\d+)\)/g)) add(m[1], +m[2], +m[3]);
    }
  }
  return ranges;
}

function expandLineMention(m) {
  const first = [+m[1], m[2] ? +m[2] : +m[1]];
  const rest = [...(m[3] ?? "").matchAll(/\d+/g)].map((x) => [+x[0], +x[0]]);
  return [first, ...rest];
}

/**
 * @param {{ answer: string, context: object[], repoFiles: string[], expectedFiles?: string[] }} input
 */
export function analyzeAnswer({ answer, context, repoFiles, expectedFiles = [] }) {
  const contextFiles = new Set(context.flatMap((d) => d.files ?? [d.source]));
  const ranges = allowedRanges(context);

  const fileCites = new Map(); // resolved-or-raw -> { token, resolved, grounded }
  const lineCites = [];
  let unattributed = 0;
  let lastFile = null;

  for (const line of answer.split("\n")) {
    // events in this text line, in order of position
    const events = [];
    for (const m of line.matchAll(FILE_TOKEN)) {
      if (NOT_FILES.has(m[0].toLowerCase())) continue;
      events.push({ pos: m.index, kind: "file", token: m[0] });
    }
    for (const m of line.matchAll(LINE_MENTION)) {
      events.push({ pos: m.index, kind: "lines", mention: m });
    }
    events.sort((a, b) => a.pos - b.pos);

    let current = null; // most recent file mention in THIS text line
    for (const ev of events) {
      if (ev.kind === "file") {
        const resolved = resolveFile(ev.token, repoFiles);
        const key = resolved ?? normalize(ev.token);
        if (!fileCites.has(key)) {
          fileCites.set(key, { token: ev.token, resolved, grounded: resolved !== null && contextFiles.has(resolved) });
        }
        current = { token: ev.token, resolved };
        lastFile = current;
      } else {
        const target = current ?? lastFile;
        for (const [a, b] of expandLineMention(ev.mention)) {
          if (!target) {
            unattributed++;
            continue;
          }
          const fileRanges = target.resolved ? ranges.get(target.resolved) ?? [] : [];
          const valid = fileRanges.some(([lo, hi]) => a >= lo && b <= hi);
          lineCites.push({ file: target.resolved ?? target.token, a, b, valid });
        }
      }
    }
  }

  const files = [...fileCites.values()];
  const citedResolved = new Set(files.map((f) => f.resolved).filter(Boolean));
  return {
    files,
    nonexistentFiles: files.filter((f) => f.resolved === null).map((f) => f.token),
    ungroundedFiles: files.filter((f) => f.resolved !== null && !f.grounded).map((f) => f.resolved),
    lineCites,
    invalidLineCites: lineCites.filter((c) => !c.valid),
    unattributedLineCites: unattributed,
    expectedFilesCited: expectedFiles.filter((f) => citedResolved.has(f)).length,
    expectedFilesTotal: expectedFiles.length,
  };
}
