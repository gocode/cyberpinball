// Le parcours du banc des écrans (interne/demos/banc-ecrans-rapides.cjs), en une partie : Electron sans fenêtre, borne chargée.
//
// Relevé du 26/11/2026 : le parcours entier faisait un seul test de 110 à 167 s, qui fixait la durée de toute la suite lente
// (le train attendait ce fichier seul). L'ouverture de chaque écran lit le disque (PuP-Pack de 3 000 fichiers, 300 tables,
// antivirus : 2 à 6 s) ; les 25 écrans sont indépendants. Le banc se passe donc en quatre parties (CP_BANC_PARTIE), une par
// fichier de test (ecrans-rapides*.test.ts), que node:test lance en parallèle. L'invariant ne change pas : chaque écran du
// parcours est visité, reconstruit six fois, sans lecture du disque, sous 40 ms.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { REPO_ROOT } from './i18n-scan';
import { DEMOS, withoutInternal } from './interne';
import { removeTempDir } from './temp-dir';

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

/** Les parties du parcours, dans l'ordre du banc ; chacune a son fichier de test. */
export const PARTIES = ['fiches', 'gerer-1', 'gerer-2', 'ajouter'] as const;
export type Partie = (typeof PARTIES)[number];

/** Ce que chaque partie doit avoir parcouru (début des titres d'écran du relevé du banc). */
export const TITRES: Record<Partie, string[]> = {
  fiches: ['Back to the Future', 'Crédits', 'Menu système', 'Toutes les tables'],
  'gerer-1': ['Gérer la table', 'Parties du jeu', 'Médias du jeu'],
  'gerer-2': ['Gérer la table', 'PuP-Pack', 'Supprimer'],
  ajouter: ['Ajouter une table', 'Choisir des fichiers'],
};

const skip = (electron ? false : 'Electron sous Windows requis') || (built ? false : 'npm run build requis') || withoutInternal();

/** Le test d'une partie du parcours. La borne d'essai (des milliers de fichiers) est gardée d'un passage à l'autre, et partagée par les parties. */
export function parcoursEcrans(partie: Partie): void {
  test(`borne chargée, partie « ${partie} » : aucun écran du parcours ne lit le disque en se reconstruisant, chacun sous 40 ms`, { skip, timeout: 600_000 }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ecrans-'));
    const root = path.join(os.tmpdir(), 'cp-banc-ecrans-racine');
    try {
      const env: NodeJS.ProcessEnv = { ...process.env, CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_RESEAU: 'simule', CYBERPINBALL_HORS_LIGNE: '1', CP_BANC_OUT: dir, CP_BANC_RACINE: root, CP_BANC_PARTIE: partie, CYBERPINBALL_LANGUE: 'fr' };
      delete env.ELECTRON_RUN_AS_NODE;
      delete env.CYBERPINBALL_A_L_ECRAN;
      delete env.CP_BANC_STRICT;
      const run = runElectron(electron!, [path.join(DEMOS, 'banc-ecrans-rapides.cjs'), `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 540_000, cwd: REPO_ROOT });
      const result = fs.existsSync(path.join(dir, 'resultat.txt')) ? fs.readFileSync(path.join(dir, 'resultat.txt'), 'utf8') : `${run.stdout}\n${run.stderr}`;
      assert.equal(run.status, 0, result);
      assert.match(result, /^RÉUSSI$/m, result);
      assert.doesNotMatch(result, /lit le disque en se construisant/, result);
      // La partie couvre bien ses écrans du relevé.
      for (const heading of TITRES[partie]) assert.match(result, new RegExp(`« ${heading}`), `${heading} absent du parcours (${partie})\n${result}`);
    } finally {
      removeTempDir(dir);
    }
  });
}
