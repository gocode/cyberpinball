// Le dossier temporaire de chaque processus de test : le sien, dans %TEMP%, vidé à la sortie.
//
// Cause (25/11/2026) : les tests créaient leurs dossiers d'essai à même %TEMP% (cp-orientation, cyberpinball-b2s,
// cp-dof…) et en laissaient la plupart derrière eux : 810 000 entrées dans %TEMP% de ce poste. Or le code
// testé remonte jusqu'à la racine du disque en listant chaque dossier parent (installation.ts, findInstallation) :
// tant que %TEMP% est plein, chaque essai y paie 2 s (les 11 essais d'installation-dispositions : 29 s, contre
// 4 s avec un %TEMP% propre).
//
// Chargé avant chaque fichier de test (scripts/console-sur-stderr.mjs, donc par `node --test`) : TEMP et TMP
// pointent vers <os.tmpdir()>\cyberpinball-tests\<pid>, que le processus supprime en sortant : les essais ne
// laissent plus rien dans %TEMP%, et un dossier à part n'ajoute pas d'entrées à %TEMP% lui-même. Rien n'est
// écrit hors de os.tmpdir() : ni profil, ni Documents. Les dossiers d'un processus tué (délai dépassé) sont
// retirés par le processus suivant, une fois vieux d'un jour. Sans effet hors de Windows, ou avec
// CYBERPINBALL_TESTS_TEMP=0. Fixé par scripts/temp-tests.test.mjs.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const UN_JOUR_MS = 24 * 3600 * 1000;
const NOM_BASE = 'cyberpinball-tests';

/** Le dossier qui contient ceux des processus de test : dans %TEMP%. */
export const baseTests = (tmpdir = os.tmpdir()) => path.join(path.resolve(tmpdir), NOM_BASE);

/** Vrai si `dir` est déjà un dossier de processus de test (celui d'un parent dont on hérite l'environnement). */
const dejaIsole = (dir) => path.basename(path.dirname(path.resolve(dir))).toLowerCase() === NOM_BASE;

/** Retire de `base` les dossiers de processus abandonnés (plus vieux que `ancienMs`). Rend ceux retirés. */
export function purgerAbandonnes(base, { now = Date.now(), ancienMs = UN_JOUR_MS } = {}) {
  const retires = [];
  for (const name of fs.readdirSync(base)) {
    const dir = path.join(base, name);
    try {
      if (now - fs.statSync(dir).mtimeMs > ancienMs) {
        fs.rmSync(dir, { recursive: true, force: true });
        retires.push(name);
      }
    } catch {
      // Pris par un autre processus, ou en cours d'usage : laissé.
    }
  }
  return retires;
}

/**
 * Isole le dossier temporaire du processus : met TEMP et TMP de `env` sur un dossier à lui, supprimé à la sortie.
 * Rend ce dossier, ou undefined quand rien n'est fait (hors Windows, désactivé, déjà isolé par le processus
 * parent dont on hérite l'environnement, ou dossier impossible à créer : on reste alors sur %TEMP%).
 */
export function isolerTemp({ env = process.env, platform = process.platform, tmpdir = os.tmpdir(), pid = process.pid, onExit = (f) => process.on('exit', f) } = {}) {
  if (platform !== 'win32' || env.CYBERPINBALL_TESTS_TEMP === '0') return undefined;
  // Un processus lancé par un test hérite du dossier de son parent, qui le supprimera : pas d'imbrication.
  if (dejaIsole(tmpdir)) return undefined;
  const base = baseTests(tmpdir);
  try {
    fs.mkdirSync(base, { recursive: true });
    purgerAbandonnes(base);
    const dir = path.join(base, String(pid));
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir);
    env.TEMP = dir;
    env.TMP = dir;
    onExit(() => {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {
        // Un fichier encore tenu par un processus lancé par le test : le prochain passage le retire.
      }
    });
    return dir;
  } catch {
    return undefined;
  }
}
