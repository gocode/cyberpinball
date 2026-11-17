// Une phrase par ligne dans les documents découpés (scripts/decoupage.mjs) : une branche qui
// change une phrase ne touche qu'une ligne, et deux branches qui écrivent dans le même paragraphe
// fusionnent sans conflit. Le rendu Markdown ne change pas : les lignes d'un paragraphe se
// rejoignent à l'affichage.

const ENDS = new Set(['.', '!', '?', '…']);
const CLOSERS = new Set(['»', ')', ']', '"', '*', '_', '`', '’', "'", String.fromCharCode(0xa0), String.fromCharCode(0x202f)]); // espaces insécables

/** Une phrase peut commencer ici : majuscule, guillemet, lien, code ou gras. */
function startsSentence(s, k) {
  const c = s[k];
  if (!c) return false;
  if (/\p{Lu}/u.test(c) || c === '«' || c === '[' || c === '`' || c === '"') return true;
  return (c === '*' || c === '_') && /[\p{L}*_]/u.test(s[k + 1] ?? '');
}

/** Le texte qui précède `i` finit une phrase (ponctuation finale, puis guillemets ou parenthèses fermants). */
function endsSentence(s, start, i) {
  let j = i - 1;
  while (j > start && CLOSERS.has(s[j])) j--;
  return j > start && ENDS.has(s[j]);
}

/** Phrases d'un texte d'une ligne : coupées après la ponctuation finale, jamais dans un code, un lien, des parenthèses ou des guillemets. */
export function sentences(s) {
  const out = [];
  let start = 0;
  let code = 0;
  let paren = 0;
  let bracket = 0;
  let quote = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '`') {
      let n = 1;
      while (s[i + n] === '`') n++;
      if (!code) code = n;
      else if (code === n) code = 0;
      i += n - 1;
      continue;
    }
    if (code) continue;
    if (c === '\\') { i++; continue; }
    if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
    else if (c === '[') bracket++;
    else if (c === ']') bracket = Math.max(0, bracket - 1);
    else if (c === '«') quote++;
    else if (c === '»') quote = Math.max(0, quote - 1);
    else if (c === ' ' && !paren && !bracket && !quote && endsSentence(s, start, i) && startsSentence(s, i + 1)) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

/**
 * Une phrase par ligne, sans rien changer au rendu : seuls les paragraphes et les points de liste
 * sont coupés (la suite d'un point garde son retrait), jamais un titre, un tableau, un bloc de code
 * ou de HTML.
 */
export function reflow(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const out = [];
  let fence = null;
  let html = false;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      out.push(line);
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length).trim()) fence = null;
      continue;
    }
    if (f) { fence = f[1]; out.push(line); continue; }
    if (html) { out.push(line); if (!line.trim()) html = false; continue; }
    if (/^\s*</.test(line)) { html = true; out.push(line); continue; }
    if (!line.trim() || /^\s*(#{1,6}\s|\|)/.test(line)) { out.push(line); continue; }
    const m = /^((?:\s*>\s?)*)(\s*(?:(?:[-*+]|\d+[.)])\s+)?)/.exec(line);
    const prefix = m[0];
    const cont = m[1] + ' '.repeat(m[2].length);
    const parts = sentences(line.slice(prefix.length));
    out.push(prefix + parts[0], ...parts.slice(1).map((p) => cont + p));
  }
  return out.join(eol);
}
