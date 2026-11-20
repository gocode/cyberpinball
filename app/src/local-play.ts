// Menu système > Communauté > Réglages de la communauté > Jouer en local (packages/core/src/localplay.ts) : un joueur qui ne joue
// que sur sa borne retire toute la partie sociale d'un coup, niveaux compris (demande d'un joueur,
// 18/11/2026). Un écran dit ce qui part et ce qui reste avant de confirmer ; activé, la rubrique ne
// garde que cette entrée, qui ramène la communauté.

import { t } from '@cyberpinball/core';
import type { Built, ProvidedSystemItem, Row } from './library';
import type { SocialNet } from './social-net';

export interface LocalPlayHost {
  net: Pick<SocialNet, 'state' | 'setLocalPlay'>;
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  /** Le front-end se redessine (médaillon, carte du joueur, pastille). */
  redraw(): void;
}

/** Ce que retire le jeu local, dans l'ordre où le joueur le croise. */
function removedRows(): Row[] {
  return [
    { text: t('Niveaux, XP et badges'), detail: t('La carte du joueur, les moments de badge et de niveau disparaissent ; vos XP continuent de se compter en silence'), icon: 'medal' },
    { text: t('Amis, joueurs en ligne, demandes d’amis'), detail: t('Personne ne vous voit, vous ne voyez personne'), icon: 'friends' },
    { text: t('Messages, salons, groupes, parties instantanées'), detail: t('Avec la pastille des messages et la Communauté au téléphone'), icon: 'message' },
    { text: t('Classements en ligne'), detail: t('Le tableau des scores garde ceux de cette borne'), icon: 'trophy' },
    { text: t('Le médaillon Communauté de la roue'), detail: t('Et « Jouer avec un ami » sur la fiche des tables'), icon: 'globe' },
  ];
}

/** Ce qui reste, pour qu'on ne craigne pas de tout perdre. */
function keptRows(): Row[] {
  return [
    { text: t('Toutes vos tables, leurs scores sur cette borne, le Juke-box'), icon: 'tables' },
    { text: t('La mise à jour de Cyber Pinball, les Nouveautés, Retours et propositions'), icon: 'upgrade' },
    { text: t('Vos amis, vos XP et vos badges, gardés tels quels : tout revient si vous remettez la communauté'), icon: 'check' },
  ];
}

export function createLocalPlayItem(host: LocalPlayHost): ProvidedSystemItem {
  const local = () => host.net.state().localPlay === true;

  async function set(on: boolean): Promise<void> {
    await host.net.setLocalPlay(on);
    console.log(`Jouer en local : ${on ? 'activé, partie sociale retirée' : 'désactivé, communauté remise'}.`); // i18n-ignore : journal
    host.redraw();
    host.library.openSystem();
  }

  function build(): Built {
    if (local())
      return {
        heading: t('Jouer en local'),
        icon: 'cabinet',
        lead: t('La borne joue en local : toute la partie sociale est retirée, niveaux compris.'),
        sections: [{ title: t('Remettre la communauté ramène'), rows: removedRows() }],
        actions: [
          { label: t('Remettre la communauté'), detail: t('Le partage repart : amis, niveaux, badges et classements reviennent'), icon: 'check', tone: 'ok', run: () => set(false) },
          { label: t('Rester en local'), icon: 'back', run: () => host.library.openSystem() },
        ],
        back: () => host.library.openSystem(),
      };
    return {
      heading: t('Jouer en local'),
      icon: 'cabinet',
      lead: t('Pour une borne qui ne joue qu’en local : toute la partie sociale part d’un coup, niveaux compris.'),
      sections: [
        { title: t('Ce qui est retiré'), rows: removedRows() },
        { title: t('Ce qui reste'), rows: keptRows() },
      ],
      actions: [
        { label: t('Jouer en local'), detail: t('Le réseau des bornes s’arrête ; rien n’est effacé'), icon: 'cabinet', run: () => set(true) },
        { label: t('Annuler'), icon: 'back', run: () => host.library.openSystem() },
      ],
      back: () => host.library.openSystem(),
    };
  }

  return {
    get label() {
      return local() ? t('Jouer en local : activé') : t('Jouer en local');
    },
    get detail() {
      return local()
        ? t('Toute la partie sociale est retirée, niveaux compris (Start : remettre la communauté)')
        : t('Retirer toute la partie sociale d’un coup : niveaux, badges, amis, messages, salons, classements en ligne');
    },
    get tone() {
      return local() ? ('ok' as const) : undefined;
    },
    // Le curseur sur l'action sûre : Annuler, ou Rester en local.
    run: () => host.library.openCustom(build, 1),
  };
}
