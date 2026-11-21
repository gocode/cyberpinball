// Ce que partage chaque lancement de node --test (vérifier, contrôles, avant-fusion, fusionner).
// console-sur-stderr.mjs : la console des tests ne se mêle pas aux résultats sérialisés de node --test.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const NODE_TEST_ARGS = ['--import', pathToFileURL(path.join(here, 'console-sur-stderr.mjs')).href, '--test'];

/** Le binaire d'Electron du dossier `cwd`. */
export const electronExe = (cwd) => path.join(cwd, 'node_modules', 'electron', 'dist', 'electron.exe');

/**
 * Electron installé avant tout test lent. Sinon chaque fichier de test qui le lance déclenche son
 * téléchargement en même temps que les autres, et ceux qui arrivent pendant l'extraction tombent sur
 * « spawnSync … electron.exe EBUSY » en 0,1 s (21/11/2026 : tous les tests de l'assistant, juste après
 * le npm ci de fusionner). Rend false si l'installation a échoué.
 */
export function ensureElectron(cwd, say = console.log) {
  if (process.platform !== 'win32' || fs.existsSync(electronExe(cwd))) return true;
  const install = path.join(cwd, 'node_modules', 'electron', 'install.js');
  if (!fs.existsSync(install)) return true; // pas d'Electron dans ce dossier : les tests lents se sautent d'eux-mêmes
  say('Electron pas encore téléchargé dans ce dossier : installation…');
  const r = spawnSync(process.execPath, [install], { cwd, stdio: 'inherit', windowsHide: true });
  if (r.status === 0 && fs.existsSync(electronExe(cwd))) return true;
  say('Installation d’Electron impossible : les tests lents vont échouer.');
  return false;
}
