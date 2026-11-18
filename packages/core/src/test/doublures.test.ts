// Les doublures des services et des hôtes de l'application passent par leurs fabriques
// (app\src\doublures, règle et raison dans neutre.ts), jamais par un objet écrit à la main.
//
// Incidents : le mode invité (`guest`, obligatoire dans l'hôte de l'écran des tables) a cassé
// 13 démonstrations d'un coup ; le 18/11/2026, `news` ajouté au service des retours dans une branche
// a cassé, à la fusion seulement, le « service simulé, contrat entier » qu'une autre branche venait
// d'écrire dans une démonstration (réparé le matin même pour un autre membre). Au relevé du
// 18/11/2026 : 160 doublures écrites à la main, dont 127 imitaient un service déjà imité ailleurs,
// et 71 commits en sept semaines leur avaient ajouté des membres neutres.
//
// Ce test lit les fabriques avec le compilateur (les membres de ce que chacune rend), puis chaque
// démonstration et chaque test : un objet écrit à la main d'au moins quatre membres, presque tous
// des fonctions, dont tous les membres appartiennent au contrat d'une fabrique, l'imite. Il doit
// passer par la fabrique, qui lui donne les autres membres et suivra l'interface. Les surcharges
// passées à une fabrique (`fakeX({ … })`) ne comptent pas.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { DEMOS, internalFiles, REPO } from './interne';

const FAKES_DIR = path.join(REPO, 'app', 'src', 'doublures');
const TESTS_DIR = path.join(REPO, 'packages', 'core', 'src', 'test');

interface Contract {
  fake: string;
  members: Set<string>;
}

/** Ce que rend chaque fabrique (fakeX) : les noms de ses membres, obligatoires ou non. */
function contracts(): Contract[] {
  const index = path.join(FAKES_DIR, 'index.ts');
  const program = ts.createProgram([index], {
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
  const sf = program.getSourceFile(index)!;
  const found: Contract[] = [];
  for (const s of checker.getExportsOfModule(checker.getSymbolAtLocation(sf)!)) {
    if (!/^fake[A-Z]/.test(s.name)) continue;
    const real = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
    const decl = real.valueDeclaration ?? real.declarations?.[0];
    if (!decl) continue;
    for (const sig of checker.getTypeOfSymbolAtLocation(real, decl).getCallSignatures()) {
      const members = new Set(checker.getPropertiesOfType(sig.getReturnType()).map((p) => p.name));
      found.push({ fake: s.name, members });
    }
  }
  return found;
}

const CONTRACTS = contracts();

const nameOf = (p: ts.ObjectLiteralElementLike) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : undefined);
const isFunctionLike = (p: ts.ObjectLiteralElementLike) =>
  ts.isMethodDeclaration(p) || (ts.isPropertyAssignment(p) && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer)));

/** La fabrique à qui l'objet est passé tel quel (ses surcharges), ou undefined. */
function fakeOf(node: ts.ObjectLiteralExpression): string | undefined {
  let at: ts.Node = node.parent;
  while (ts.isParenthesizedExpression(at) || ts.isAsExpression(at) || ts.isSatisfiesExpression(at)) at = at.parent;
  if (!ts.isCallExpression(at) || at.arguments[0] !== node) return undefined;
  const e = at.expression;
  const callee = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : '';
  // Une aide locale d'un test (fakeFetch, fakeMachine…) n'est pas une fabrique : son objet est jugé comme les autres.
  return CONTRACTS.some((c) => c.fake === callee) ? callee : undefined;
}

/** Objets écrits à la main d'un script qui imitent le contrat d'une fabrique. */
export function imitations(file: string, text: string): string[] {
  const kind = /\.ts$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    const fake = ts.isObjectLiteralExpression(node) ? fakeOf(node) : undefined;
    if (fake && ts.isObjectLiteralExpression(node)) {
      // Une surcharge qui n'est pas un membre du contrat : mal placée, ou d'un membre que l'interface n'a plus.
      const contract = CONTRACTS.find((c) => c.fake === fake)!;
      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      for (const n of node.properties.map(nameOf)) if (n !== undefined && !contract.members.has(n)) found.push(`${file}:${line} : ${fake}({ ${n} }) n'est pas un membre du contrat`);
    }
    if (ts.isObjectLiteralExpression(node) && !node.properties.some(ts.isSpreadAssignment) && !fake) {
      const names = node.properties.map(nameOf);
      const functions = node.properties.filter(isFunctionLike).length;
      if (names.length >= 4 && names.every((n) => n !== undefined) && functions / names.length >= 0.75) {
        // Le contrat le plus proche : celui dont l'objet couvre la plus grande part.
        const match = CONTRACTS.filter((c) => names.every((n) => c.members.has(n!))).sort((a, b) => a.members.size - b.members.size)[0];
        if (match) {
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          found.push(`${file}:${line} imite ${match.fake.replace(/^fake/, '')} : ${match.fake}({ … })`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test('les fabriques de doublures sont lues (au moins une par contrat imité à plusieurs endroits)', () => {
  const fakes = new Set(CONTRACTS.map((c) => c.fake));
  for (const name of ['fakeSocialNet', 'fakeLibraryHost', 'fakeMenuLibrary', 'fakeFeedbackService', 'fakeLiveGames', 'fakeFriendContent']) assert.ok(fakes.has(name), `${name} introuvable`);
  assert.ok(CONTRACTS.find((c) => c.fake === 'fakeSocialNet')!.members.size > 50);
});

test('chaque module de doublures est exporté par index.ts', () => {
  const index = fs.readFileSync(path.join(FAKES_DIR, 'index.ts'), 'utf8');
  const missing = fs
    .readdirSync(FAKES_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'neutre.ts')
    .filter((f) => !index.includes(`export * from './${f.replace(/\.ts$/, '')}';`));
  assert.deepEqual(missing, []);
});

test('aucun module de l’application n’importe les doublures (elles restent hors de ce qui est livré)', () => {
  const users: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full !== FAKES_DIR) walk(full);
      } else if (entry.name.endsWith('.ts') && /from '\.{1,2}\/(\.\.\/)*doublures/.test(fs.readFileSync(full, 'utf8'))) users.push(path.relative(REPO, full));
    }
  };
  walk(path.join(REPO, 'app', 'src'));
  assert.deepEqual(users, []);
});

test('les démonstrations et les tests passent par les fabriques de doublures, jamais par un objet écrit à la main', () => {
  const found: string[] = [];
  for (const script of internalFiles(DEMOS, /\.(cjs|js|mjs)$/)) found.push(...imitations(`démonstration ${script}`, fs.readFileSync(path.join(DEMOS, script), 'utf8')));
  for (const file of fs.readdirSync(TESTS_DIR).filter((f) => f.endsWith('.ts') && f !== 'doublures.test.ts')) {
    found.push(...imitations(file, fs.readFileSync(path.join(TESTS_DIR, file), 'utf8')));
  }
  assert.deepEqual(found, [], 'remplacer chaque objet par la fabrique nommée (app\\dist\\doublures\\index.js ; tests : ./doublures)');
});

test('un service des retours écrit à la main est relevé, ses surcharges passées à la fabrique ne le sont pas (18/11/2026)', () => {
  const script = [
    "const { fakeFeedbackService } = require(path.join(REPO, 'app', 'dist', 'doublures', 'index.js'));",
    'createFeedbackMenu({',
    '  dataDir,',
    '  service: {',
    '    refresh: async () => undefined,',
    '    list: () => [],',
    "    net: () => 'ok',",
    '    canWrite: () => true,',
    '  },',
    '});',
    "createFeedbackMenu({ dataDir, service: fakeFeedbackService({ list: () => [], net: () => 'ok', canWrite: () => true, refresh: async () => undefined }) });",
    'const ailleurs = { list: () => [], net: () => 1, canWrite: () => true, inconnu: () => 0 };',
    // Le script de migration avait enveloppé l'objet des options au lieu du réseau qu'il contient.
    'createLiveGames(fakeSocialNet({ net: { state, online, send }, dataDir, play: async () => undefined }));',
  ].join('\n');
  assert.deepEqual(imitations('témoin.cjs', script), [
    'témoin.cjs:4 imite FeedbackService : fakeFeedbackService({ … })',
    "témoin.cjs:13 : fakeSocialNet({ net }) n'est pas un membre du contrat",
    "témoin.cjs:13 : fakeSocialNet({ dataDir }) n'est pas un membre du contrat",
    "témoin.cjs:13 : fakeSocialNet({ play }) n'est pas un membre du contrat",
  ]);
});
