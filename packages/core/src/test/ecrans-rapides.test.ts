// Écrans du front-end reconstruits à chaque touche (library.ts) : relevé du 17/11/2026 dans les
// journaux des démonstrations, fiche d'une table à 700 ms, « Gérer la table » à 438 ms, « Ajouter une
// table » à 595 ms. Chaque construction relisait le disque (inventaire de la table, PuP-Pack de
// milliers de fichiers, dossier de téléchargements, dossier d'import) : les flippers ramaient et
// perdaient des appuis. Correctif de la classe : un écran lit le disque à son ouverture et garde ses
// lectures (kept) ; ses reconstructions n'en font plus aucune, et un guet le vérifie en essai
// (build-guard.ts). Ce test fixe l'invariant sur une borne chargée (banc des écrans, Electron sans fenêtre).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { PARTIES, parcoursEcrans } from './ecrans-rapides-banc';
import { REPO_ROOT } from './i18n-scan';
import { removeTempDir } from './temp-dir';

const APP_SRC = path.join(REPO_ROOT, 'app', 'src');
const code = (file: string) => fs.readFileSync(path.join(APP_SRC, file), 'utf8').replace(/\/\/.*$/gm, '');

const built = fs.existsSync(path.join(REPO_ROOT, 'app', 'dist', 'library.js'));

interface DiskReads {
  count: number;
  calls: Record<string, number | undefined>;
}
interface BuildGuard {
  countDiskReads<T>(work: () => T): { value: T; reads: DiskReads };
  describeDiskReads(reads: DiskReads): string;
  diskWatchEnabled(env: NodeJS.ProcessEnv): boolean;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const guard = () => require(path.join(REPO_ROOT, 'app', 'dist', 'build-guard.js')) as BuildGuard;

test('le guet compte les lectures du disque faites pendant une construction, et seulement elles', { skip: built ? false : 'npm run build requis' }, () => {
  const { countDiskReads, describeDiskReads } = guard();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-guet-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
    const { value, reads } = countDiskReads(() => {
      fs.readdirSync(dir);
      fs.statSync(path.join(dir, 'a.txt'));
      return fs.readFileSync(path.join(dir, 'a.txt'), 'utf8');
    });
    assert.equal(value, 'a');
    assert.equal(reads.calls.readdirSync, 1);
    assert.equal(reads.calls.statSync, 1);
    assert.ok(reads.count >= 3);
    // Le nom seul dans le journal, jamais le chemin du poste.
    assert.match(describeDiskReads(reads), /readdirSync ×1 \(cp-guet-/);
    assert.doesNotMatch(describeDiskReads(reads), new RegExp(os.tmpdir().replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')));
    // Après : les fonctions de node:fs sont rendues, plus rien n'est compté.
    const { reads: none } = countDiskReads(() => 1);
    fs.readdirSync(dir);
    assert.equal(none.count, 0);
  } finally {
    removeTempDir(dir);
  }
});

test('le guet tourne en essai hors écran, jamais sur une borne', { skip: built ? false : 'npm run build requis' }, () => {
  const { diskWatchEnabled } = guard();
  assert.equal(diskWatchEnabled({ CYBERPINBALL_HORS_ECRAN: '1' }), true);
  assert.equal(diskWatchEnabled({ CYBERPINBALL_GUET_DISQUE: '1' }), true);
  assert.equal(diskWatchEnabled({ CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_GUET_DISQUE: '0' }), false);
  assert.equal(diskWatchEnabled({}), false);
});

test('une construction ne relit le disque qu’à l’ouverture de l’écran : reconstructions chronométrées et guettées', () => {
  const library = code('library.ts');
  const build = library.match(/function build\(\): Built \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(build, /const opening = reads\.of !== screen \|\| !reads\.fresh;/);
  assert.match(build, /warnSlowOpening\(/);
  assert.match(build, /diskWatch \? watchedBuild : buildScreen/);
  assert.match(build, /warnSlowBuild\(/);
  // Toute action qui laisse l'écran affiché le fait relire (une suppression, un réglage écrit).
  assert.equal((library.match(/afterRun\(/g) ?? []).length, 4, 'les trois appels d’une action, plus afterRun lui-même');
  assert.doesNotMatch(library, /void (built\.actions\[(cursor|index)\][!?]?|hit)\.run\(\)/, 'une action se lance par afterRun(… .run(), before)');
  // Le guet des dossiers dit à l'écran ouvert que le disque a changé.
  assert.match(code('frontend.ts'), /library\.changed\(\);\s*broadcast\(\);/);
});

// Le parcours des écrans est découpé en parties (ecrans-rapides-banc.ts), une par fichier de test : celui-ci passe la première.
test('le parcours du banc est découpé en autant de parties que de fichiers de test, et le banc connaît les mêmes', () => {
  const banc = fs.readFileSync(path.join(REPO_ROOT, 'interne', 'demos', 'banc-ecrans-rapides.cjs'), 'utf8');
  assert.ok(banc.includes(`const PARTIES = [${PARTIES.map((p) => `'${p}'`).join(', ')}];`), 'le banc et ecrans-rapides-banc.ts ont les mêmes parties');
  const dir = path.join(REPO_ROOT, 'packages', 'core', 'src', 'test');
  for (const partie of PARTIES) {
    const file = partie === PARTIES[0] ? 'ecrans-rapides.test.ts' : `ecrans-rapides-${partie}.test.ts`;
    assert.ok(fs.existsSync(path.join(dir, file)), `${file} : un fichier de test par partie`);
    assert.match(fs.readFileSync(path.join(dir, file), 'utf8'), new RegExp(`parcoursEcrans\\('${partie}'\\)`), `${file} passe la partie ${partie}`);
  }
});

parcoursEcrans('fiches');
