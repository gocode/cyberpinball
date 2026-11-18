// Doublures du navigateur intégré et du téléphone, voir neutre.ts :
// - les évènements du navigateur intégré (AcquireEvents, acquire-window.ts) ; le dossier d'arrivée
//   est toujours celui de l'appelant ;
// - le menu que pilote le téléphone (MenuTarget, phone-remote.ts) : au menu, aucun champ, envoi refusé.

import type { AcquireEvents } from '../acquire-window';
import type { MenuTarget } from '../phone-remote';
import { noop, overlay } from './neutre';

export function fakeAcquireEvents(over: Partial<AcquireEvents> & Pick<AcquireEvents, 'dir'>): AcquireEvents {
  return overlay<AcquireEvents>({ dir: over.dir, received: noop, progress: noop, failed: noop, closed: noop }, over);
}

export function fakeMenuTarget(over?: Partial<MenuTarget>): MenuTarget {
  return overlay<MenuTarget>(
    {
      phase: () => 'menu',
      screen: () => ({ title: '' }),
      field: () => undefined,
      button: noop,
      setText: noop,
      enter: noop,
      uploadDir: () => ({ refused: 'fakeMenuTarget' }), // i18n-ignore : doublure d'essai
      uploading: noop,
      uploaded: noop,
      changed: noop,
    },
    over,
  );
}
