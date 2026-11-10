// Avant toute demande d'autorisation de Windows (Contrôle de compte d'utilisateur, UAC) : prévenir,
// et ne la lancer qu'après confirmation. La demande s'affiche sur le bureau sécurisé de Windows, où
// aucune application ne peut répondre à la place de l'utilisateur : les boutons de la borne n'y
// peuvent rien, il faut un clavier (Alt+O pour Oui, Échap pour Non) ou une souris (PinCab,
// 10/11/2026 : « Installer Firefox » bloquait sur cette demande). L'écran le dit, propose de le faire
// plus tard au bureau, et « Plus tard » est choisi d'office : rien ne part par mégarde.
// Toute élévation de l'application passe par ici (garde-fou : packages/core/src/test/sorties.test.ts).

import { ELEVATION_WAIT_MS, t } from '@cyberpinball/core';
import type { Action, Built } from './library';

export interface ElevationAsk {
  /** Titre de l'écran (« Pare-feu de Windows »). */
  title: string;
  /** Ce que Windows va autoriser (« Autoriser Cyber Pinball dans le pare-feu de Windows »). */
  what: string;
  /** L'utilisateur confirme : la demande de Windows part. */
  go: () => void | Promise<void>;
  /** Plus tard : retour à l'écran d'où l'on venait. */
  later: () => void;
}

/** L'écran d'avertissement ; « Plus tard » en premier, choisi d'office. */
export function elevationScreen(ask: ElevationAsk): Built {
  const actions: Action[] = [
    { label: t('Plus tard, au bureau'), icon: 'back', key: 'later', run: ask.later },
    { label: t('Continuer : Windows demande l’autorisation'), icon: 'lock', key: 'go', tone: 'warning', run: ask.go },
  ];
  return {
    heading: ask.title,
    icon: 'lock',
    lead: ask.what,
    sections: [
      {
        kind: 'jb-flash',
        rows: [
          {
            text: t('Windows va demander une autorisation'),
            detail: t('Répondez au clavier ou à la souris : Alt+O pour Oui, Échap pour Non. Les boutons de la borne n’y peuvent rien : Windows refuse toute réponse qui ne vient pas d’un vrai clavier ou d’une vraie souris. Sans réponse dans les {min} minutes, Cyber Pinball cesse d’attendre.', { min: ELEVATION_WAIT_MS / 60_000 }),
            tone: 'warning',
            icon: 'alert',
          },
        ],
      },
    ],
    actions,
    back: ask.later,
  };
}

/** Montre l'avertissement avec `open` (openCustom de l'écran appelant), « Plus tard » choisi. */
export function askElevation(open: (build: () => Built, at?: number) => void, ask: ElevationAsk): void {
  open(() => elevationScreen(ask), 0);
}
