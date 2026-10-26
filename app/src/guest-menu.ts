// Menu système > Borne > « Mode invité » : pour une soirée ou les enfants. L'écran dit ce que
// l'invité peut faire, la combinaison qui déverrouille (seul endroit où elle est écrite : ni le
// menu ni la partie ne la montrent) et ce qui reste fermé ; Start l'active, et le menu des tables
// s'ouvre aussitôt, verrouillé (guestmode.ts).

import { GUEST_UNLOCK_MS, guestUnlockHands, t, tn, type CabinetButtons, type GuestMode } from '@cyberpinball/core';
import type { Built, ProvidedSystemItem } from './library';

export interface GuestMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    leave(): void;
  };
  guest: Pick<GuestMode, 'active' | 'set'>;
  /** Boutons de la borne en vigueur : la combinaison les nomme. */
  buttons(): CabinetButtons | undefined;
}

export function createGuestMenu(host: GuestMenuHost): ProvidedSystemItem {
  function open(): void {
    host.library.openCustom(() => {
      const back = () => host.library.openSystem();
      const hands = guestUnlockHands(host.buttons());
      const seconds = GUEST_UNLOCK_MS / 1000;
      return {
        heading: t('Mode invité'),
        icon: 'guest',
        lead: t('Pour une soirée ou les enfants : choisir une table, jouer, lire le prospectus, les règles et les commandes. Le verrouillage reste actif après un redémarrage.'),
        sections: [
          { rows: [{ icon: 'unlock', text: t('Désactivé · menu complet accessible'), tone: 'info' }] },
          {
            title: t('Pour déverrouiller'),
            rows: [
              { text: t('Main gauche'), detail: hands.left },
              { text: t('Main droite'), detail: hands.right },
              {
                icon: 'lock',
                text: tn(seconds, 'Maintenir les quatre boutons pendant {n} seconde', 'Maintenir les quatre boutons pendant {n} secondes'),
                detail: t('Depuis le menu, hors partie : l’anneau du cadenas se remplit.'),
              },
            ],
          },
          {
            title: t('Fermé en mode invité'),
            rows: [
              { icon: 'lock', text: t('Menu système, réglages de VPX, Bureau Windows, quitter, fichiers glissés') },
              { icon: 'lock', text: t('Dans la fiche : modifier, médias, fichiers, réglages, diagnostic, supprimer') },
            ],
          },
        ],
        actions: [
          {
            label: t('Activer le mode invité'),
            detail: t('Ouvre le menu des tables, verrouillé'),
            icon: 'lock',
            tone: 'ok',
            run: () => {
              host.library.leave();
              host.guest.set(true);
            },
          },
          { label: t('Retour'), icon: 'back', run: back },
        ],
        back,
      };
    });
  }

  return {
    get detail() {
      return t('Pour une soirée ou les enfants : on joue, rien d’autre');
    },
    run: open,
  };
}
