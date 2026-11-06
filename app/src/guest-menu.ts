// Menu système > Borne > « Mode invité » : pour une soirée ou les enfants. L'écran dit ce que
// l'invité peut faire, la combinaison qui déverrouille (seul endroit où elle est écrite : ni le
// menu ni la partie ne la montrent) et ce qui reste fermé ; Start l'active, et le menu des tables
// s'ouvre aussitôt, verrouillé (guestmode.ts). « Tables proposées » peut le restreindre à une
// collection (les favoris, un fabricant…) : les MagnaSave n'en changent plus, et la collection
// d'avant revient au déverrouillage.

import { GUEST_UNLOCK_MS, guestUnlockHands, t, tn, type CabinetButtons, type GuestMode } from '@cyberpinball/core';
import type { Built, ProvidedSystemItem } from './library';

export interface GuestMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    leave(): void;
  };
  guest: Pick<GuestMode, 'active' | 'set'>;
  /** Collections non vides, que l'invité peut se voir imposer (collections.ts), et l'active. */
  collections(): { choices: { id: string; label: string; count: number }[]; active: string };
  /** Boutons de la borne en vigueur : la combinaison les nomme. */
  buttons(): CabinetButtons | undefined;
}

export function createGuestMenu(host: GuestMenuHost): ProvidedSystemItem {
  /** Collection imposée à l'invité ; undefined : toutes, au choix des MagnaSave. */
  let only: string | undefined;

  function open(): void {
    const { active } = host.collections();
    // Par défaut, ce que montre déjà la roue : Favoris si on y est, sinon toutes.
    only = active === 'all' ? undefined : active;
    host.library.openCustom(() => {
      const back = () => host.library.openSystem();
      const { choices } = host.collections();
      const chosen = choices.find((c) => c.id === only);
      if (!chosen) only = undefined;
      // Start passe au choix suivant : toutes (MagnaSave libres), puis chaque collection non vide.
      const ring: (string | undefined)[] = [undefined, ...choices.filter((c) => c.id !== 'all').map((c) => c.id)];
      const next = () => {
        only = ring[(ring.indexOf(only) + 1) % ring.length];
      };
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
            label: chosen ? t('Tables proposées : {collection} ({n})', { collection: chosen.label, n: chosen.count }) : t('Tables proposées : toutes'),
            detail: chosen ? t('Start : choix suivant · les MagnaSave ne changent pas de collection') : t('Start : choix suivant · les MagnaSave passent d’une collection à l’autre'),
            icon: chosen ? 'star' : 'tables',
            key: 'guest-collection',
            run: next,
          },
          {
            label: t('Activer le mode invité'),
            detail: chosen ? t('Ouvre le menu des tables, verrouillé sur « {collection} »', { collection: chosen.label }) : t('Ouvre le menu des tables, verrouillé'),
            icon: 'lock',
            tone: 'ok',
            run: () => {
              host.library.leave();
              host.guest.set(true, only);
              if (only) console.log(`Mode invité : limité à la collection ${only}.`); // i18n-ignore : journal
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
