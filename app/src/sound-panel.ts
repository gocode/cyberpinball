// Panneau « Son » de Windows, ouvert par l'assistant quand une carte son doit passer en 7.1 pour le
// SSF : Windows n'a pas d'interface publique pour changer la configuration des haut-parleurs, le
// joueur la choisit lui-même (Configurer > 7.1 Surround). Cyber Pinball ne modifie rien.

import * as path from 'node:path';
import { shell } from 'electron';
import { t } from '@cyberpinball/core';
import { refuseOffscreen } from './offscreen';

/** Ouvre le panneau Son (mmsys.cpl, par son association Windows) ; renvoie ce qui l'en a empêché. */
export function openSoundPanel(): string | undefined {
  const refused = refuseOffscreen(t('Le panneau Son de Windows'));
  if (refused) return refused;
  if (process.platform !== 'win32') return t('Le panneau Son ne s’ouvre que sous Windows.');
  // i18n-ignore : chemin Windows
  const cpl = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'mmsys.cpl');
  void shell.openPath(cpl).then((error) => {
    if (error) console.error(t('Le panneau Son n’a pas pu s’ouvrir ({detail}).', { detail: error }));
  });
  return undefined;
}
