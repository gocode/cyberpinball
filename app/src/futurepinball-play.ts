// Partie d'une table de Future Pinball (19/11/2026 ; par BAM quand il est installé, 20/11/2026). La partie
// elle-même suit celle des jeux de Zen (playPinballFx, frontend.ts) : chargement, barres des tâches, autres
// front-ends, appui long sur Exit, statistiques, retour à la roue. Ici ce qui est propre à Future Pinball :
// où est le jeu, la commande (`/open "<table>.fpt" /play /exit`, par FPLoader de BAM s'il est là ; le jeu
// se ferme quand on quitte la table), ce qui empêche de jouer, et la place de sa fenêtre sur le playfield.

import * as fs from 'node:fs';
import { findFuturePinball, FUTURE_PINBALL_NAME, futurePinballCommand, futurePinballPlacement, t, type FuturePinballCommand, type FuturePinballInstall, type Rect, type TableEntry } from '@cyberpinball/core';
import type { WindowInfo } from '@cyberpinball/win-displays';
import { FUTURE_PINBALL_BAM_LAUNCH_GAME, FUTURE_PINBALL_LAUNCH_GAME, type ZenLaunchGame } from './pinballfx-launcher';

/** Hors écran, les démonstrations donnent un faux Future Pinball (dossier contenant « Future Pinball.exe »). */
export const FUTURE_PINBALL_SIMULATED_ENV = 'CYBERPINBALL_FUTURE_PINBALL_SIMULE';

/**
 * Future Pinball sur ce PC : le faux des démonstrations, celui choisi à la main (gardé dans le dossier
 * des données), sinon le premier des emplacements habituels. Relu à chaque appel.
 */
export function detectFuturePinball(dataDir: string): FuturePinballInstall | undefined {
  const simulated = process.env[FUTURE_PINBALL_SIMULATED_ENV];
  return findFuturePinball({ dataDir, ...(simulated ? { candidates: [simulated] } : {}) });
}

/** Ce que la partie demande au lanceur, ou pourquoi elle est impossible. */
export interface FuturePinballPlan {
  name: string;
  why?: string;
  command?: FuturePinballCommand;
  launchGame: ZenLaunchGame;
  /** Dernière ligne du message d'échec : ce qu'il faut vérifier. */
  failureHint: string;
}

export interface FuturePinballPlanOptions {
  /** Partie simulée hors écran : ni jeu ni commande. */
  simulated?: string;
  mode?: 'display';
  /** Le jeu trouvé (detectFuturePinball) ; absent : introuvable. */
  install?: FuturePinballInstall;
  exists?: (p: string) => boolean;
}

export function futurePinballPlan(table: Pick<TableEntry, 'file'>, opts: FuturePinballPlanOptions): FuturePinballPlan {
  const name = FUTURE_PINBALL_NAME;
  const exists = opts.exists ?? fs.existsSync;
  const command = opts.install ? futurePinballCommand(opts.install, table.file) : undefined;
  const why =
    opts.mode === 'display'
      ? t('Le cadrage d’une table de {game} se règle dans le jeu (Préférences, Vidéo).', { game: name })
      : opts.simulated !== undefined
        ? undefined
        : !opts.install
          ? t('{game} est introuvable sur ce PC. Menu système > Tables > Ajouter une table > « Tables de {game} » : choisir son dossier.', { game: name })
          : !exists(table.file)
            ? t('Le fichier de la table est introuvable : {file}.', { file: table.file })
            : !command
              ? t('Ce chemin ne peut pas être donné à {game} : {file}.', { game: name, file: table.file })
              : undefined;
  return {
    name,
    ...(why ? { why } : {}),
    ...(command && opts.simulated === undefined ? { command } : {}),
    launchGame: command?.bam ? FUTURE_PINBALL_BAM_LAUNCH_GAME : FUTURE_PINBALL_LAUNCH_GAME,
    failureHint: command?.bam
      ? t('Vérifiez que la table s’ouvre en lançant BAM\\FPLoader.exe vous-même : ses bibliothèques (.fpl), sa version de BAM.')
      : t('Vérifiez que la table s’ouvre dans {game} lui-même : ses bibliothèques (.fpl) et sa version du jeu.', { game: name }),
  };
}

/**
 * Fenêtre de Future Pinball ouverte ailleurs que sur le playfield (mode fenêtre) : posée sur lui. Une
 * fenêtre plein écran (elle couvre exactement un écran) reste où le jeu l'a mise. Renvoie la place donnée.
 */
export function placeFuturePinballWindow(w: WindowInfo, playfield: Rect | undefined, displays: readonly Rect[], setBounds: (w: WindowInfo, r: Rect) => boolean): Rect | undefined {
  const to = futurePinballPlacement(w.rect, playfield, displays);
  if (!to) return undefined;
  return setBounds(w, to) ? to : undefined;
}
