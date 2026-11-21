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
import { runElectron } from './electron-run';
import { REPO_ROOT } from './i18n-scan';
import { DEMOS, withoutInternal } from './interne';
import { removeTempDir } from './temp-dir';

const APP_SRC = path.join(REPO_ROOT, 'app', 'src');
const code = (file: string) => fs.readFileSync(path.join(APP_SRC, file), 'utf8').replace(/\/\/.*$/gm, '');

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO_ROOT] })) as string;
  } catch {
    return undefined;
  }
}
const electron = process.platform === 'win32' ? electronPath() : undefined;
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

const skip = (electron ? false : 'Electron sous Windows requis') || (built ? false : 'npm run build requis') || withoutInternal();

test('borne chargée : aucun écran du parcours ne lit le disque en se reconstruisant, chacun sous 40 ms', { skip, timeout: 600_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ecrans-'));
  // La borne d'essai (des milliers de fichiers) est gardée d'un passage à l'autre : l'écrire prend du temps.
  const root = path.join(os.tmpdir(), 'cp-banc-ecrans-racine');
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_RESEAU: 'simule', CYBERPINBALL_HORS_LIGNE: '1', CP_BANC_OUT: dir, CP_BANC_RACINE: root, CYBERPINBALL_LANGUE: 'fr' };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.CYBERPINBALL_A_L_ECRAN;
    delete env.CP_BANC_STRICT;
    const run = runElectron(electron!, [path.join(DEMOS, 'banc-ecrans-rapides.cjs'), `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 540_000, cwd: REPO_ROOT });
    const result = fs.existsSync(path.join(dir, 'resultat.txt')) ? fs.readFileSync(path.join(dir, 'resultat.txt'), 'utf8') : `${run.stdout}\n${run.stderr}`;
    assert.equal(run.status, 0, result);
    assert.match(result, /^RÉUSSI$/m, result);
    assert.doesNotMatch(result, /lit le disque en se construisant/, result);
    // Le parcours couvre bien les écrans du relevé.
    for (const heading of ['Back to the Future', 'Gérer la table', 'Parties du jeu', 'Médias du jeu', 'Crédits', 'Ajouter une table', 'Choisir des fichiers', 'Menu système', 'Toutes les tables']) {
      assert.match(result, new RegExp(`« ${heading}`), `${heading} absent du parcours\n${result}`);
    }
  } finally {
    removeTempDir(dir);
  }
});
