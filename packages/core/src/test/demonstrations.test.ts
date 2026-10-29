// Les démonstrations sans opérateur (docs\*.cjs, *.js, *.mjs) suivent le code qu'elles montrent.
//
// Incident du 29/10/2026 : deux démonstrations cassaient en silence depuis des fusions faites
// ailleurs. La bibliothèque d'un ami (demo-sortie-de-liste.cjs) plantait (« Cannot read
// properties of undefined (reading 'finisher') ») : createFriendLibraryMenu attendait désormais
// `downloads` et `library.isShowing`, que l'hôte simulé de la démonstration ne donnait pas. Les
// scripts de docs\ sont du JavaScript que tsc ne lit pas : rien ne le voyait avant de les rejouer.
//
// Ce test lit chaque script avec le compilateur TypeScript et, pour tout module de l'application
// qu'il charge (require d'un …\dist\x.js) :
// - chaque nom qu'il en prend (déstructuré, ou `core.nom`) est encore exporté ;
// - chaque appel à l'une de ces fonctions (ou `new` d'une de ces classes) a ses arguments
//   obligatoires, et un objet écrit en entier (hôte simulé, options) a tous les membres
//   obligatoires du type attendu, objets imbriqués compris ; un objet étalé (`...x`) n'est pas jugé ;
// - chaque texte traduit qu'il nomme (t('…'), T('…'), core.t('…') : un libellé d'action, un titre
//   d'écran) existe encore dans le code de l'application : un libellé renommé fait échouer ici,
//   pas au milieu d'une démonstration que personne ne relance.
// Une démonstration peut encore suivre un chemin d'écrans qui a changé : seul son passage le montre.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const DOCS = path.join(REPO, 'docs');
const SCRIPTS = fs.readdirSync(DOCS).filter((f) => /\.(cjs|js|mjs)$/.test(f)).sort();

/** Module source (…\src\x.ts) d'un require d'un …\dist\x.js ; undefined pour tout autre require. */
function moduleOf(call: ts.CallExpression): { file: string; spec: string } | undefined {
  if (!ts.isIdentifier(call.expression) || call.expression.text !== 'require') return undefined;
  const arg = call.arguments[0];
  let parts: string[];
  if (arg && ts.isStringLiteral(arg)) parts = arg.text.split('/');
  else if (arg && ts.isCallExpression(arg) && arg.expression.getText() === 'path.join') parts = arg.arguments.filter(ts.isStringLiteral).map((a) => a.text);
  else return undefined;
  const at = parts.indexOf('dist');
  if (at < 1 || !/\.js$/.test(parts[parts.length - 1] ?? '')) return undefined;
  const pkg = parts.slice(0, at).filter((p) => p !== '..' && p !== '.');
  return { file: path.join(REPO, ...pkg, 'src', ...parts.slice(at + 1)).replace(/\.js$/, '.ts'), spec: parts.join('/') };
}

interface Use {
  script: string;
  source: ts.SourceFile;
  /** Nom local → module et nom exporté (undefined : le module entier, `const core = require(…)`). */
  bindings: Map<string, { file: string; spec: string; name?: string }>;
}

/** Un script lu : ce qu'il prend à chaque module de l'application. */
function parse(script: string, text: string): Use {
  const source = ts.createSourceFile(script, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const bindings: Use['bindings'] = new Map();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
      const mod = moduleOf(node.initializer);
      if (mod && ts.isIdentifier(node.name)) bindings.set(node.name.text, mod);
      if (mod && ts.isObjectBindingPattern(node.name)) {
        for (const el of node.name.elements) {
          if (!ts.isIdentifier(el.name)) continue;
          const name = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text;
          bindings.set(el.name.text, { ...mod, name });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { script, source, bindings };
}

const uses = SCRIPTS.map((script) => parse(script, fs.readFileSync(path.join(DOCS, script), 'utf8')));

const files = [...new Set(uses.flatMap((u) => [...u.bindings.values()].map((b) => b.file)))].filter((f) => fs.existsSync(f));
const program = ts.createProgram(files, {
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
  types: ['node'],
  strict: true,
  skipLibCheck: true,
  noEmit: true,
});
const checker = program.getTypeChecker();

/** Ce qu'exporte un module source, alias résolus (export * from, export { x } from). */
const exportsCache = new Map<string, Map<string, ts.Symbol>>();
function exportsOf(file: string): Map<string, ts.Symbol> {
  let found = exportsCache.get(file);
  if (found) return found;
  found = new Map();
  const sf = program.getSourceFile(file);
  const mod = sf && checker.getSymbolAtLocation(sf);
  for (const s of mod ? checker.getExportsOfModule(mod) : []) found.set(s.name, s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s);
  exportsCache.set(file, found);
  return found;
}

const isOptional = (p: ts.Symbol) => (p.flags & ts.SymbolFlags.Optional) !== 0;
const nameOf = (p: ts.ObjectLiteralElementLike) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : undefined);

/** Membres obligatoires de `type` absents de l'objet écrit `lit`, objets imbriqués compris. */
function missingIn(lit: ts.ObjectLiteralExpression, type: ts.Type, label: string, at: ts.Node): string[] {
  if (lit.properties.some(ts.isSpreadAssignment)) return [];
  const t = checker.getNonNullableType(type);
  if (t.isUnion() || t.getCallSignatures().length || !(t.flags & ts.TypeFlags.Object)) return [];
  const given = new Map(lit.properties.map((p) => [nameOf(p), p] as const));
  const missing: string[] = [];
  for (const prop of checker.getPropertiesOfType(t)) {
    const el = given.get(prop.name);
    if (!el) {
      if (!isOptional(prop)) missing.push(`${label}.${prop.name} manque`);
      continue;
    }
    if (ts.isPropertyAssignment(el) && ts.isObjectLiteralExpression(el.initializer)) {
      missing.push(...missingIn(el.initializer, checker.getTypeOfSymbolAtLocation(prop, at), `${label}.${prop.name}`, at));
    }
  }
  return missing;
}

/** Ce qui manque à un appel pour au moins une signature ; vide si l'une d'elles est satisfaite. */
function callProblems(call: ts.CallExpression | ts.NewExpression, sigs: readonly ts.Signature[], callee: string, at: ts.Node): string[] {
  if (!sigs.length) return [];
  const args = call.arguments ?? ts.factory.createNodeArray();
  let best: string[] | undefined;
  for (const sig of sigs) {
    const problems: string[] = [];
    const params = sig.getParameters();
    const required = params.filter((p) => {
      const d = p.valueDeclaration;
      return !(d && ts.isParameter(d) && (d.questionToken || d.initializer || d.dotDotDotToken));
    }).length;
    if (args.length < required) problems.push(`${callee} attend ${required} argument(s), en reçoit ${args.length}`);
    args.forEach((arg, i) => {
      const param = params[i];
      if (param && ts.isObjectLiteralExpression(arg)) problems.push(...missingIn(arg, checker.getTypeOfSymbolAtLocation(param, at), `${callee}(…)`, at));
    });
    if (!problems.length) return [];
    if (!best || problems.length < best.length) best = problems;
  }
  return best ?? [];
}

test('les modules que chargent les démonstrations existent encore', () => {
  const gone = uses.flatMap((u) => [...new Set([...u.bindings.values()].filter((b) => !fs.existsSync(b.file)).map((b) => b.spec))].map((spec) => `${u.script} : ${spec}`));
  assert.ok(files.length > 5, `modules trouvés : ${files.length}`);
  assert.deepEqual(gone, []);
});

test('les noms que prennent les démonstrations sont encore exportés', () => {
  const problems: string[] = [];
  for (const u of uses) {
    for (const b of u.bindings.values()) {
      if (b.name && fs.existsSync(b.file) && !exportsOf(b.file).has(b.name)) problems.push(`${u.script} : ${b.name} (${b.spec}) n'est plus exporté`);
    }
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
        const b = u.bindings.get(node.expression.text);
        if (b && !b.name && fs.existsSync(b.file) && !exportsOf(b.file).has(node.name.text)) problems.push(`${u.script} : ${node.expression.text}.${node.name.text} (${b.spec}) n'est plus exporté`);
      }
      ts.forEachChild(node, visit);
    };
    visit(u.source);
  }
  assert.deepEqual([...new Set(problems)], []);
});

/** Appels d'un script aux modules de l'application à qui il manque un argument ou un membre obligatoire. */
function callIssues(u: Use): { problems: string[]; checked: number } {
  const problems: string[] = [];
  let checked = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const e = node.expression;
      let target: { file: string; name: string } | undefined;
      if (ts.isIdentifier(e)) {
        const b = u.bindings.get(e.text);
        if (b?.name) target = { file: b.file, name: b.name };
      } else if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
        const b = u.bindings.get(e.expression.text);
        if (b && !b.name) target = { file: b.file, name: e.name.text };
      }
      const symbol = target && fs.existsSync(target.file) ? exportsOf(target.file).get(target.name) : undefined;
      const decl = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
      if (symbol && decl) {
        const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
        const sigs = ts.isNewExpression(node) ? type.getConstructSignatures() : type.getCallSignatures();
        checked++;
        const line = u.source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        for (const p of callProblems(node, sigs, target!.name, decl)) problems.push(`${u.script}:${line} : ${p}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(u.source);
  return { problems, checked };
}

test('les appels des démonstrations donnent tout ce qu’attend l’application (hôtes simulés compris)', () => {
  const all = uses.map(callIssues);
  const checked = all.reduce((n, r) => n + r.checked, 0);
  assert.ok(checked > 50, `appels vérifiés : ${checked}`);
  assert.deepEqual(all.flatMap((r) => r.problems), []);
});

test('un hôte simulé à qui manque un membre obligatoire est relevé (le menu d’un ami sans downloads, 29/10/2026)', () => {
  const script = [
    "const { createFriendLibraryMenu } = require(path.join(WT, 'app', 'dist', 'friend-library-menu.js'));",
    'createFriendLibraryMenu({',
    '  library: { openCustom() {}, isShowing: () => false, openSystem() {}, openMediasWith() {}, catalogFor() {}, installReceived() {} },',
    '  net: { state: () => ({ friends: [] }), online: () => true },',
    '  content,',
    '  live: { inviteOn() {} },',
    '  tables: () => [],',
    '  root: () => undefined,',
    '  redraw() {},',
    '});',
    "createFriendLibraryMenu({ library: { openCustom() {} }, net, content, downloads, live, tables, root, redraw });",
  ].join('\n');
  assert.deepEqual(callIssues(parse('témoin.cjs', script)).problems, [
    'témoin.cjs:2 : createFriendLibraryMenu(…).downloads manque',
    'témoin.cjs:11 : createFriendLibraryMenu(…).library.isShowing manque',
    'témoin.cjs:11 : createFriendLibraryMenu(…).library.openSystem manque',
    'témoin.cjs:11 : createFriendLibraryMenu(…).library.openMediasWith manque',
    'témoin.cjs:11 : createFriendLibraryMenu(…).library.catalogFor manque',
    'témoin.cjs:11 : createFriendLibraryMenu(…).library.installReceived manque',
  ]);
});

/** Tout le code de l'application : sources TypeScript (hors tests) et rendu. */
function appText(): string {
  const parts: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test' && entry.name !== 'node_modules') walk(full);
      } else if (/\.(ts|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) parts.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(path.join(REPO, 'app', 'src'));
  walk(path.join(REPO, 'app', 'renderer'));
  for (const pkg of fs.readdirSync(path.join(REPO, 'packages'))) {
    const src = path.join(REPO, 'packages', pkg, 'src');
    if (fs.existsSync(src)) walk(src);
  }
  return parts.join('\n');
}

const APP_TEXT = appText();

/** Textes traduits (t('…'), T('…'), core.t('…')) que nomme un script et que l'application n'a plus. */
function unknownTexts(u: Use): { problems: string[]; named: number } {
  const problems: string[] = [];
  let named = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      const e = node.expression;
      const translates =
        (ts.isIdentifier(e) && (e.text === 't' || e.text === 'T')) ||
        (ts.isPropertyAccessExpression(e) && e.name.text === 't' && ts.isIdentifier(e.expression) && u.bindings.has(e.expression.text) && !u.bindings.get(e.expression.text)!.name);
      if (translates) {
        const fr = node.arguments[0].text;
        named++;
        const quoted = [`'${fr.replace(/'/g, "\'")}'`, `"${fr.replace(/"/g, '\\"')}"`, `\`${fr}\``];
        if (!quoted.some((q) => APP_TEXT.includes(q))) problems.push(`${u.script} : « ${fr} »`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(u.source);
  return { problems: [...new Set(problems)], named };
}

test('les textes traduits que nomment les démonstrations existent encore dans l’application', () => {
  const all = uses.map(unknownTexts);
  const named = all.reduce((n, r) => n + r.named, 0);
  assert.ok(named > 20, `textes nommés : ${named}`);
  assert.deepEqual(all.flatMap((r) => r.problems), []);
});

test('un libellé que l’application n’a plus est relevé', () => {
  const script = [
    "const core = require(path.join(WT, 'packages', 'core', 'dist', 'index.js'));",
    'const T = (fr, params) => core.t(fr, params);',
    "await act(T('Téléchargements'));",
    "await act(T('Fichiers téléchargés de jadis'));",
    "core.t('Médias du jeu');",
  ].join('\n');
  assert.deepEqual(unknownTexts(parse('témoin.cjs', script)), { problems: ['témoin.cjs : « Fichiers téléchargés de jadis »'], named: 3 });
});
