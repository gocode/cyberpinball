// Ouvre un fichier ou un dossier avec ce que Windows y associe (l'installateur de Future Pinball lancé à
// la main, le dossier où l'installer). Hors écran, jamais : un essai sans opérateur ne montre rien sur le bureau.

import { shell } from 'electron';
import { t } from '@cyberpinball/core';
import { refuseOffscreen } from './offscreen';

/** Ouvre `target` ; renvoie ce qui l'en a empêché (aussi dit à l'écran), ou undefined quand Windows l'ouvre. */
export function openPathForUser(target: string, what: string): Promise<string | undefined> {
  const refused = refuseOffscreen(what);
  if (refused) return Promise.resolve(refused);
  return shell.openPath(target).then((error) => (error ? t('{what} ne s’ouvre pas : {detail}', { what, detail: error }) : undefined));
}
