// Translating the comments of a source file without touching its code.
//
//   node scripts/traduire-commentaires.mjs --extraire <file.ts> <blocks.txt>
//       writes every comment of the file into <blocks.txt>, one block per comment (consecutive
//       line comments are grouped), each preceded by a header "@@@ <n> | <next line of code>";
//   (translate the text of each block in <blocks.txt>, keeping the "@@@ <n>" headers)
//   node scripts/traduire-commentaires.mjs --appliquer <file.ts> <blocks.txt>
//       puts each block back in place of the original comment, from the end of the file.
//
// The blocks are raw text: no escaping, a backslash stays a backslash. Before writing, the
// application refuses a block that would no longer be a comment, or that loses a marker read by a
// tool or a test (i18n-ignore, lecture entière :, @ts-expect-error, eslint-disable,
// /// <reference ...>). The file is written
// only if every block passes. Then prove the change with scripts/commentaires-seuls.mjs.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * Markers that tools and tests read in comments: kept verbatim by a translation
 * ("lecture entière :" justifies a whole-file read, lecture-bornee.test.ts).
 */
export const MARKERS = /i18n-ignore-file|i18n-ignore|lecture entière :|@ts-expect-error|@ts-ignore|@ts-nocheck|eslint-[a-z-]+|<reference [^>]*>|c8 ignore[^\n]*|istanbul ignore[^\n]*|#(?:end)?region/g;

function scriptKind(file) {
  if (/\.tsx$/i.test(file)) return ts.ScriptKind.TSX;
  if (/\.(ts|mts|cts)$/i.test(file)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** Every comment of a source, in order: { pos, end, text }. */
export function comments(source, file = 'a.ts') {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const found = new Map();
  const add = (ranges) => {
    for (const r of ranges ?? []) if (!found.has(r.pos)) found.set(r.pos, { pos: r.pos, end: r.end, kind: r.kind });
  };
  // Every comment sits in the trivia before a token (the end-of-file token included).
  const visit = (node) => {
    // A JSDoc node lies inside its comment: its own tokens are not followed by trivia.
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    if (node.kind < ts.SyntaxKind.FirstNode || node.kind === ts.SyntaxKind.EndOfFileToken) {
      add(ts.getTrailingCommentRanges(source, node.pos));
      add(ts.getLeadingCommentRanges(source, node.pos));
      return;
    }
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  const sorted = [...found.values()].sort((a, b) => a.pos - b.pos);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].pos < sorted[i - 1].end) throw new Error(`${file}: overlapping comments at ${sorted[i].pos}`);
  return sorted.map((c) => ({ ...c, text: source.slice(c.pos, c.end) }));
}

/**
 * Comments grouped into blocks: consecutive line comments separated only by a line break and
 * indentation form one block, so a translation can re-wrap them.
 */
export function blocks(source, file = 'a.ts') {
  const out = [];
  for (const c of comments(source, file)) {
    const last = out[out.length - 1];
    const between = last ? source.slice(last.end, c.pos) : '';
    if (last && last.line && c.kind === ts.SyntaxKind.SingleLineCommentTrivia && /^\r?\n[ \t]*$/.test(between) && lineStartsWith(source, c.pos)) {
      last.end = c.end;
    } else out.push({ pos: c.pos, end: c.end, line: c.kind === ts.SyntaxKind.SingleLineCommentTrivia && lineStartsWith(source, c.pos) });
  }
  return out.map((b, i) => ({ id: i + 1, pos: b.pos, end: b.end, text: source.slice(b.pos, b.end) }));
}

/** True when only indentation precedes the position on its line. */
function lineStartsWith(source, pos) {
  const start = source.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*$/.test(source.slice(start, pos));
}

/** The text of <blocks.txt>: each block after its header, with the next line of code as a hint. */
export function formatBlocks(source, list) {
  return list
    .map((b) => {
      const next = (source.slice(b.end).split(/\r?\n/).find((l) => l.trim()) ?? '').trim().slice(0, 100);
      return `@@@ ${b.id} | ${next}\n${b.text.replace(/\r\n/g, '\n')}\n`;
    })
    .join('');
}

/** Blocks read back from <blocks.txt>: Map id -> text (line breaks as LF). */
export function parseBlocks(text) {
  const map = new Map();
  let id;
  let lines = [];
  const flush = () => {
    if (id !== undefined) map.set(id, lines.join('\n').replace(/\n+$/, ''));
  };
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^@@@ (\d+)(?: \|.*)?$/.exec(line);
    if (m) {
      flush();
      id = Number(m[1]);
      lines = [];
    } else if (id !== undefined) lines.push(line);
  }
  flush();
  return map;
}

/** Problems of a translated block, compared with the original (empty: fine). */
export function blockProblems(original, translated) {
  const problems = [];
  const isLine = original.startsWith('//');
  if (isLine) {
    for (const l of translated.split('\n')) if (!/^\s*\/\//.test(l)) problems.push(`line that is not a // comment: ${l.slice(0, 60)}`);
  } else {
    if (!/^\/\*[\s\S]*\*\/$/.test(translated)) problems.push('block comment not closed by */ or not opened by /*');
    else if (translated.slice(2, -2).includes('*/')) problems.push('*/ inside the block comment');
  }
  const markers = (s) => (s.match(MARKERS) ?? []).join(' | ');
  if (markers(original) !== markers(translated)) problems.push(`markers changed: "${markers(original)}" became "${markers(translated)}"`);
  // A \u escape turned into a real character by an editor would go unnoticed.
  const escapes = (s) => (s.match(/\\u[0-9a-fA-F]{4}|\\u\{/g) ?? []).length;
  if (escapes(original) !== escapes(translated)) problems.push('\\u escapes changed');
  return problems;
}

/** The source with the translated blocks in place; throws with every problem found. */
export function applyBlocks(source, file, translations) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const list = blocks(source, file);
  const problems = [];
  for (const id of translations.keys()) if (!list.some((b) => b.id === id)) problems.push(`@@@ ${id}: no such block in ${file}`);
  let out = source;
  for (const b of [...list].reverse()) {
    if (!translations.has(b.id)) continue;
    const text = translations.get(b.id);
    for (const p of blockProblems(b.text.replace(/\r\n/g, '\n'), text)) problems.push(`@@@ ${b.id}: ${p}`);
    // Line breaks of the original block, one by one when the line count is the same (a file may
    // mix them), else its first one, else those of the file.
    const breaks = b.text.match(/\r?\n/g) ?? [];
    const lines = text.split('\n');
    const joined = lines.length === breaks.length + 1 ? lines.map((l, i) => l + (breaks[i] ?? '')).join('') : lines.join(breaks[0] ?? eol);
    out = out.slice(0, b.pos) + joined + out.slice(b.end);
  }
  if (problems.length) throw new Error(`${file}:\n  ${problems.join('\n  ')}`);
  return out;
}

function main([mode, file, blocksFile]) {
  if (!['--extraire', '--appliquer'].includes(mode) || !file || !blocksFile) {
    console.error('Usage: node scripts/traduire-commentaires.mjs --extraire|--appliquer <file> <blocks.txt>');
    return 2;
  }
  const source = fs.readFileSync(file, 'utf8');
  if (mode === '--extraire') {
    const list = blocks(source, file);
    fs.writeFileSync(blocksFile, formatBlocks(source, list));
    console.log(`${list.length} comment blocks of ${file} written to ${blocksFile}.`);
    return 0;
  }
  const translations = parseBlocks(fs.readFileSync(blocksFile, 'utf8'));
  try {
    fs.writeFileSync(file, applyBlocks(source, path.basename(file), translations));
  } catch (error) {
    console.error(String(error.message ?? error));
    return 1;
  }
  console.log(`${translations.size} comment blocks put back in ${file}.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
