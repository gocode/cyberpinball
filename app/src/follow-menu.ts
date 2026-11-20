// « Nous suivre » à la borne (décision du 20/11/2026) : une liste à choisir des endroits où l'on
// trouve Cyber Pinball (packages/core/src/follow.ts : Facebook, YouTube, GitHub, la page Facebook
// selon la langue). Tant qu'une ligne est choisie, son QR code est sous les actions, à viser au
// téléphone ; Start ouvre la page dans le navigateur intégré. Sans navigateur (mode invité), Start
// montre la page du QR code en grand. À la télécommande, chaque ligne est un lien que le téléphone
// ouvre lui-même (Action.link), sans QR code.
//
// La page s'ouvre, discrète, depuis les écrans où l'on cherche de l'aide : Retours et propositions,
// le diagnostic d'une table (`action`). Son entrée du Menu système (`systemItem`) attend la refonte
// des menus, qui lui choisira sa place.

import { followLinks, t, type FollowLink } from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem } from './library';
import { qrRows } from './remote-qr';

export interface FollowMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  /** La page dans le navigateur intégré ; faux quand elle ne peut pas l'être (mode invité) : sa page de QR code s'ouvre alors. */
  browse(link: FollowLink): boolean;
}

export function createFollowMenu(host: FollowMenuHost) {
  function open(back: () => void, at = 0): void {
    host.library.openCustom(() => page(back), at);
  }

  function page(back: () => void): Built {
    const actions: Action[] = followLinks().map((link, i) => ({
      label: link.name,
      detail: link.purpose,
      icon: link.icon,
      key: `follow:${link.network}`,
      qr: { url: link.url, title: t('{name} sur votre téléphone', { name: link.name }) },
      link: link.url,
      run: () => {
        if (!host.browse(link)) openCode(link, () => open(back, i));
      },
    }));
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Nous suivre'),
      icon: 'globe',
      lead: t('Tutoriels vidéo, nouveautés, réponses à vos questions : retrouvez Cyber Pinball ici. Start ouvre la page ; son QR code l’ouvre sur votre téléphone.'),
      sections: [],
      actions,
      back,
    };
  }

  /** Sans navigateur intégré : le QR code de la page, en grand. */
  function openCode(link: FollowLink, back: () => void): void {
    host.library.openCustom(() => ({
      heading: link.name,
      icon: link.icon,
      subheading: link.purpose,
      remote: { phase: 'offer' as const, qr: qrRows(link.url), url: link.url, title: '', line: '' },
      remoteWording: {
        offer: t('{name} sur votre téléphone', { name: link.name }),
        offerLines: [t('Visez ce code avec votre téléphone pour ouvrir la page.'), link.short],
      },
      sections: [],
      actions: [{ label: t('Retour'), icon: 'back', run: back }],
      back,
    }));
  }

  return {
    open,
    /** La ligne discrète d'un écran d'aide : elle ouvre « Nous suivre », Retour y ramène. */
    action(back: () => void): Action {
      return {
        label: t('Nous suivre'),
        detail: followLinks()
          .map((link) => link.name)
          .join(' · '), // i18n-ignore : noms des réseaux, qui ne se traduisent pas
        icon: 'globe',
        tone: 'quiet',
        key: 'follow',
        run: () => open(back),
      };
    },
    /** Entrée du Menu système, à brancher (provideSystemItem) quand la refonte des menus lui aura donné sa place. */
    systemItem: {
      get detail() {
        return t('Tutoriels vidéo, nouveautés, questions');
      },
      run: () => open(() => host.library.openSystem()),
    } satisfies ProvidedSystemItem,
  };
}

export type FollowMenu = ReturnType<typeof createFollowMenu>;
