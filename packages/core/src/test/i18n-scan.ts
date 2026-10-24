// Relevé des textes de l'interface dans les sources (i18n.test.ts, et à la main) :
// chaque appel t('…') / tn(n, '…', '…') et chaque élément data-i18n des pages donne une
// clé du catalogue ; tout autre texte qui a l'air français est un texte codé en dur.
// Ne comptent pas : commentaires, journaux de console (console.log/warn/error…), et
// les lignes marquées « i18n-ignore » (noms de fichiers, motifs de recherche, noms propres).
//
// À la main : npx tsc -b packages/core && node packages/core/dist/test/i18n-scan.js [fichiers…]
// (sans fichier : toutes les sources, plus les contrôles du catalogue).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EN_PARTS } from '../i18n/en';

export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/** Sources de l'interface, relatives à la racine du dépôt. */
export function interfaceSources(root = REPO_ROOT): string[] {
  const files: string[] = [];
  const add = (dir: string, test: (name: string) => boolean) => {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) return;
    for (const name of fs.readdirSync(full).sort()) if (test(name)) files.push(`${dir}/${name}`);
  };
  const ts = (name: string) => name.endsWith('.ts') && !name.endsWith('.d.ts');
  add('app/src', ts);
  add('app/renderer', (name) => (name.endsWith('.js') || name.endsWith('.html')) && !name.startsWith('fallback-demo'));
  add('packages/core/src', ts);
  add('packages/installer/src', ts);
  add('packages/win-displays/src', ts);
  return files;
}

export interface TextUse {
  file: string;
  line: number;
  key: string;
}
export interface TextProblem {
  file: string;
  line: number;
  text: string;
}
export interface FileScan {
  keys: TextUse[];
  /** Textes qui ont l'air français, hors t() et hors journaux. */
  hardcoded: TextProblem[];
  /** Appels t()/tn() dont le texte n'est pas un littéral simple (gabarit `${}`, variable, concaténation). */
  dynamic: TextProblem[];
}

const ACCENTED = /[àâäçéèêëîïôöûùüÿœæÀÂÄÇÉÈÊËÎÏÔÖÛÙÜŸŒÆ«»’]/;
// Mots qui trahissent une phrase française (sans accent, pour ceux qui n'en ont pas).
const FRENCH_WORDS = new Set(
  (
    'le la les des du de une un pour avec sans est sont pas aucun aucune sur dans ou et au aux ce cette ces votre vos par puis ' +
    'encore plus moins tout tous toutes rien ne qui que quand si sous chaque leur leurs mon ma mes ton nous vous il elle ils ' +
    'jouer retour continuer enregistrer annuler fermer oui non quitter supprimer ajouter chercher valider changer choisir ouvrir ' +
    'gauche droit droite haut bas plateau fronton borne jeu jeux son fichier fichiers dossier touche touches bouton boutons ' +
    'corbeille attente partie aide suivant suivante avant essayer garder remettre refaire passer revenir lancer voir afficher ' +
    'choix sortie sorties musique ranger installer installation nouvelle nouveau aucune manquant manquante trouver trouve ' +
    'depuis vers mais donc car seulement toujours jamais ici maintenant fois sauf selon comme lire lu ecrit tourner principal'
  ).split(' '),
);

/** Ce texte a-t-il l'air français ? (gabarits : les ${…} ont été retirés) */
export function looksFrench(text: string): boolean {
  if (!/[A-Za-zÀ-ÿ]{2}/.test(text)) return false;
  if (ACCENTED.test(text)) return true;
  const words = text.toLowerCase().match(/[a-zà-ÿ]+/g) ?? [];
  if (/\s/.test(text.trim())) return words.some((w) => FRENCH_WORDS.has(w));
  // Un seul mot : seulement s'il est écrit comme un libellé (« Jouer », « Retour »).
  return /^[A-Z][a-z]+$/.test(text.trim()) && FRENCH_WORDS.has(text.trim().toLowerCase());
}

interface Literal {
  value: string;
  hasExpr: boolean;
  line: number;
}
interface Frame {
  kind: '(' | '[' | '{' | '${';
  callee?: string;
  line: number;
  /** Arguments de t/tn : littéral seul, ou « autre ». */
  args?: { literal?: Literal; other: boolean }[];
}

const REGEX_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'throw', 'else', 'do', 'await', 'yield']);

/** Relevé d'un fichier .ts ou .js. */
export function scanCode(file: string, src: string): FileScan {
  const result: FileScan = { keys: [], hardcoded: [], dynamic: [] };
  const ignored = new Set<number>();
  const ignoreFile = src.includes('i18n-ignore-file');
  const stack: Frame[] = [];
  let i = 0;
  let line = 1;
  let lastSig = '';
  let lastWord = '';

  const lineOf = (start: number, end: number) => {
    for (let k = start; k < end; k++) if (src[k] === '\n') line++;
  };
  const top = () => stack[stack.length - 1];
  const currentArg = (frame: Frame) => {
    const args = frame.args!;
    if (!args.length) args.push({ other: false });
    return args[args.length - 1]!;
  };
  const markOther = () => {
    const frame = top();
    if (frame?.args) {
      const arg = currentArg(frame);
      arg.other = true;
    }
  };
  /** Nom de la fonction appelée juste avant la parenthèse ouvrante en `at`. */
  const calleeBefore = (at: number): string | undefined => {
    let k = at - 1;
    while (k >= 0 && /\s/.test(src[k]!)) k--;
    const end = k + 1;
    while (k >= 0 && /[\w$.]/.test(src[k]!)) k--;
    const name = src.slice(k + 1, end);
    if (!name || /^\d/.test(name)) return undefined;
    let j = k;
    while (j >= 0 && /\s/.test(src[j]!)) j--;
    const wordEnd = j + 1;
    while (j >= 0 && /\w/.test(src[j]!)) j--;
    const before = src.slice(j + 1, wordEnd);
    if (before === 'function') return `function ${name}`;
    if (before === 'new') return `new ${name}`;
    return name;
  };
  const inConsole = () => stack.some((f) => f.callee !== undefined && /^console\.\w+$/.test(f.callee));
  const literal = (lit: Literal) => {
    const frame = top();
    if (frame?.args) {
      const arg = currentArg(frame);
      if (!arg.literal && !arg.other) arg.literal = lit;
      else arg.other = true;
      if (frame.callee === 't' || frame.callee === 'tn') return; // relevé à la fermeture de l'appel
    }
    if (ignoreFile || ignored.has(lit.line) || inConsole()) return;
    if (looksFrench(lit.value)) result.hardcoded.push({ file, line: lit.line, text: lit.value });
  };
  const closeCall = (frame: Frame) => {
    if (frame.callee !== 't' && frame.callee !== 'tn') return;
    const args = frame.args ?? [];
    const wanted = frame.callee === 't' ? [0] : [1, 2];
    for (const index of wanted) {
      const arg = args[index];
      if (!arg?.literal || arg.other || arg.literal.hasExpr) {
        if (!ignored.has(frame.line)) result.dynamic.push({ file, line: frame.line, text: `${frame.callee}(…) : argument ${index + 1} ${arg?.literal?.hasExpr ? 'gabarit avec ${…} (utilisez {nom})' : 'non littéral'}` });
      } else result.keys.push({ file, line: arg.literal.line, key: arg.literal.value });
    }
  };

  // Marques i18n-ignore : relevées d'avance, ligne par ligne.
  src.split('\n').forEach((text, index) => {
    if (/i18n-ignore(?!-file)/.test(text)) ignored.add(index + 1);
  });

  /** Lit une chaîne '…' ou "…" à partir de i (sur le guillemet). */
  const readString = (quote: string): Literal => {
    const startLine = line;
    let value = '';
    i++;
    while (i < src.length && src[i] !== quote) {
      if (src[i] === '\\') {
        const next = src[i + 1] ?? '';
        value += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'u' ? unicodeEscape() : next;
        if (next === '\n') line++;
        i += next === 'u' ? 0 : 2;
        continue;
      }
      if (src[i] === '\n') line++;
      value += src[i];
      i++;
    }
    i++;
    return { value, hasExpr: false, line: startLine };
  };
  const unicodeEscape = (): string => {
    // i est sur « \ », i+1 sur « u »
    const brace = src[i + 2] === '{';
    const hex = brace ? src.slice(i + 3, src.indexOf('}', i)) : src.slice(i + 2, i + 6);
    i += brace ? hex.length + 4 : 6;
    return String.fromCodePoint(parseInt(hex, 16) || 0x3f);
  };

  /** Lit un gabarit `…` (i sur l'accent grave) ; les ${…} sont lus comme du code. */
  const readTemplate = (): Literal => {
    const startLine = line;
    let value = '';
    let hasExpr = false;
    i++;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') {
        value += src[i + 1] === 'n' ? '\n' : (src[i + 1] ?? '');
        if (src[i + 1] === '\n') line++;
        i += 2;
        continue;
      }
      if (src[i] === '$' && src[i + 1] === '{') {
        hasExpr = true;
        value += ' ';
        i += 2;
        stack.push({ kind: '${', line });
        code(true);
        continue;
      }
      if (src[i] === '\n') line++;
      value += src[i];
      i++;
    }
    i++;
    return { value, hasExpr, line: startLine };
  };

  /** Code jusqu'à la fin du fichier, ou jusqu'à l'accolade qui ferme un ${…} (inTemplate). */
  const code = (inTemplate: boolean) => {
    const depth = stack.length;
    lastSig = '';
    while (i < src.length) {
      const c = src[i]!;
      if (c === '\n') {
        line++;
        i++;
        continue;
      }
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (c === '/' && src[i + 1] === '/') {
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        const stop = end < 0 ? src.length : end + 2;
        lineOf(i, stop);
        i = stop;
        continue;
      }
      if (c === '/' && (REGEX_BEFORE.has(lastSig) || REGEX_KEYWORDS.has(lastWord))) {
        // Expression régulière : jusqu'au « / » qui la ferme, hors classe […].
        i++;
        let inClass = false;
        while (i < src.length && src[i] !== '\n') {
          if (src[i] === '\\') i += 2;
          else if (src[i] === '[') (inClass = true), i++;
          else if (src[i] === ']') (inClass = false), i++;
          else if (src[i] === '/' && !inClass) break;
          else i++;
        }
        i++;
        while (/[a-z]/.test(src[i] ?? '')) i++;
        markOther();
        lastSig = 'regex';
        lastWord = '';
        continue;
      }
      if (c === "'" || c === '"') {
        literal(readString(c));
        lastSig = 'str';
        lastWord = '';
        continue;
      }
      if (c === '`') {
        literal(readTemplate());
        lastSig = 'str';
        lastWord = '';
        continue;
      }
      if (c === '(' || c === '[' || c === '{') {
        markOther();
        const frame: Frame = { kind: c, line };
        if (c === '(') {
          const callee = calleeBefore(i);
          if (callee) frame.callee = callee;
          frame.args = [];
        }
        stack.push(frame);
        i++;
        lastSig = c;
        lastWord = '';
        continue;
      }
      if (c === ')' || c === ']' || c === '}') {
        if (c === '}' && inTemplate && stack.length === depth) {
          stack.pop(); // le ${ du gabarit
          i++;
          return;
        }
        const frame = stack.pop();
        if (frame) closeCall(frame);
        i++;
        lastSig = c;
        lastWord = '';
        continue;
      }
      if (c === ',') {
        const frame = top();
        if (frame?.args) {
          if (!frame.args.length) frame.args.push({ other: false });
          frame.args.push({ other: false });
        }
        i++;
        lastSig = c;
        lastWord = '';
        continue;
      }
      if (/[\w$]/.test(c)) {
        let k = i;
        while (k < src.length && /[\w$]/.test(src[k]!)) k++;
        lastWord = src.slice(i, k);
        markOther();
        i = k;
        lastSig = 'word';
        continue;
      }
      markOther();
      // « x! / 2 » : le ! d'une assertion non nulle ferme une expression, une division peut suivre.
      lastSig = c === '!' && src[i + 1] !== '=' && ['word', ')', ']'].includes(lastSig) ? 'postfix' : c;
      lastWord = '';
      i++;
    }
  };
  code(false);
  return result;
}

/** Relevé d'une page .html : texte des éléments, marqué data-i18n ou non. */
export function scanHtml(file: string, src: string): FileScan {
  const result: FileScan = { keys: [], hardcoded: [], dynamic: [] };
  const clean = src.replace(/<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, (m) => m.replace(/[^\n]/g, ' '));
  for (const match of clean.matchAll(/<([a-z][\w-]*)([^>]*)>([^<]+)(?=<)/g)) {
    const text = match[3]!.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const lineNo = clean.slice(0, match.index).split('\n').length;
    // Clé : le texte, ou la valeur de data-i18n quand un même texte français a deux sens.
    const marked = /\bdata-i18n(?:="([^"]*)")?/.exec(match[2]!);
    if (marked) result.keys.push({ file, line: lineNo, key: marked[1] || text });
    else if (looksFrench(text)) result.hardcoded.push({ file, line: lineNo, text });
  }
  return result;
}

export function scanFile(root: string, file: string): FileScan {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  return file.endsWith('.html') ? scanHtml(file, src) : scanCode(file, src);
}

export interface CatalogReport {
  missing: TextUse[];
  hardcoded: TextProblem[];
  dynamic: TextProblem[];
  /** Clé et traduction n'ont pas les mêmes {paramètres}. */
  placeholders: { key: string; part: string }[];
  /** Clé traduite différemment dans deux parties du catalogue. */
  conflicts: { key: string; parts: string[] }[];
  /** Traduction restée en français (accents) alors qu'elle diffère de la clé. */
  untranslated: { key: string; part: string }[];
  /** Clé du catalogue qu'aucune source n'utilise plus. */
  unused: { key: string; part: string }[];
}

const placeholdersOf = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort().join(',');

/** Relevé complet : sources de l'interface et catalogue anglais. */
export function scanAll(root = REPO_ROOT, files = interfaceSources(root)): CatalogReport {
  const report: CatalogReport = { missing: [], hardcoded: [], dynamic: [], placeholders: [], conflicts: [], untranslated: [], unused: [] };
  const used = new Set<string>();
  const seen = new Map<string, { value: string; part: string }[]>();
  for (const [part, catalog] of Object.entries(EN_PARTS)) {
    for (const [key, value] of Object.entries(catalog)) {
      seen.set(key, [...(seen.get(key) ?? []), { value, part }]);
      if (placeholdersOf(key) !== placeholdersOf(value)) report.placeholders.push({ key, part });
      if (value !== key && /[àâçéèêëîïôûùœ«»]/.test(value)) report.untranslated.push({ key, part });
    }
  }
  for (const [key, entries] of seen) {
    if (new Set(entries.map((e) => e.value)).size > 1) report.conflicts.push({ key, parts: entries.map((e) => e.part) });
  }
  for (const file of files) {
    const scan = scanFile(root, file);
    report.hardcoded.push(...scan.hardcoded);
    report.dynamic.push(...scan.dynamic);
    for (const use of scan.keys) {
      used.add(use.key);
      if (!seen.has(use.key) || !seen.get(use.key)!.some((e) => e.value.trim())) report.missing.push(use);
    }
  }
  for (const [key, entries] of seen) if (!used.has(key)) report.unused.push({ key, part: entries[0]!.part });
  return report;
}

/** Rapport lisible ; vide quand tout va bien. */
export function describeReport(report: CatalogReport, opts: { catalog: boolean } = { catalog: true }): string[] {
  const lines: string[] = [];
  const at = (p: { file: string; line: number }) => `${p.file}:${p.line}`;
  for (const m of report.missing) lines.push(`Sans traduction : ${at(m)} « ${m.key} »`);
  for (const d of report.dynamic) lines.push(`Clé non littérale : ${at(d)} ${d.text}`);
  for (const h of report.hardcoded) lines.push(`Texte français codé en dur : ${at(h)} « ${h.text.replace(/\s+/g, ' ').trim()} »`);
  if (opts.catalog) {
    for (const p of report.placeholders) lines.push(`Paramètres différents (${p.part}) : « ${p.key} »`);
    for (const c of report.conflicts) lines.push(`Traductions différentes (${c.parts.join(', ')}) : « ${c.key} »`);
    for (const u of report.untranslated) lines.push(`Traduction restée en français (${u.part}) : « ${u.key} »`);
    for (const u of report.unused) lines.push(`Clé inutilisée (${u.part}) : « ${u.key} »`);
  }
  return lines;
}

if (require.main === module) {
  const wanted = process.argv.slice(2).map((f) => path.relative(REPO_ROOT, path.resolve(f)).replace(/\\/g, '/'));
  const report = scanAll(REPO_ROOT, wanted.length ? wanted : interfaceSources());
  const lines = describeReport(report, { catalog: !wanted.length });
  for (const l of lines) console.log(l);
  console.log(lines.length ? `${lines.length} problème(s).` : 'Aucun problème de traduction.');
  process.exitCode = lines.length ? 1 : 0;
}
