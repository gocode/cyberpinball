// Menu système > Amis > « Scores des amis pendant la partie » (essai réel du 31/10/2026 : « proposer
// dans la configuration des joueurs où ils veulent voir les scores des autres joueurs ») : la place
// de la bande d'une partie entre amis (LiveScoresPlace, packages/core/src/gamenotice.ts). Chaque
// choix reste visible ; celui que la borne ne permet pas (pas de topper, DMD illisible…) est grisé
// avec sa raison. Le réglage vaut pour toutes les tables : une place qu'une table ne permet pas
// revient à l'automatique, et le journal le dit. Il se règle ici, hors partie : pendant la partie,
// les boutons sont à VPX, et Cyber Pinball n'a pas de menu par-dessus.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un réglage d'essai.

import { liveScoresChoices, t, type IconName, type LiveScoresCabinet, type LiveScoresPlace } from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row } from './library';

export interface LiveScoresMenuHost {
  library: { openCustom(build: () => Built, at?: number): void; openSystem(): void };
  get(): LiveScoresPlace;
  set(place: LiveScoresPlace): void;
  /** Ce que la borne permet : écrans, et l'inspector de VPX pour lire le DMD. */
  cabinet(): LiveScoresCabinet;
}

/** Une icône par choix (jamais deux fois la même dans un écran). */
const ICONS: Record<LiveScoresPlace, IconName> = { auto: 'auto', dmd: 'dmd', backglass: 'frame', topper: 'layers', 'playfield-bottom': 'playfield', 'playfield-side': 'layout' };

export function createLiveScoresMenu(host: LiveScoresMenuHost): ProvidedSystemItem {
  let flash: Row | undefined;

  function build(): Built {
    const current = host.get();
    const choices = liveScoresChoices(host.cabinet());
    const actions: Action[] = choices.map((c) => ({
      label: c.label,
      key: c.place,
      icon: ICONS[c.place],
      detail: c.unavailable ?? (c.place === current ? t('Choisi · {detail}', { detail: c.detail }) : c.detail),
      ...(c.unavailable ? { tone: 'quiet' as const } : c.place === current ? { tone: 'ok' as const } : {}),
      run: () => {
        if (c.unavailable) return;
        host.set(c.place);
        flash = { text: t('Scores des amis : {place}', { place: c.label }), tone: 'ok' };
        host.library.openCustom(build, choices.indexOf(c));
      },
    }));
    actions.push({ label: t('Retour'), icon: 'back', run: () => host.library.openSystem() });
    const shown = flash;
    flash = undefined;
    return {
      heading: t('Scores des amis pendant la partie'),
      icon: 'dmd',
      sections: [
        ...(shown ? [{ rows: [shown] }] : []),
        {
          rows: [
            {
              text: t('Pendant une partie entre amis, où voir le score et la bille des autres joueurs'),
              detail: t('Pour toutes les tables ; une place qu’une table ne permet pas revient à l’automatique. Pendant la partie, les boutons sont à VPX : le choix se fait ici.'),
              tone: 'info',
            },
          ],
        },
      ],
      actions,
      back: () => host.library.openSystem(),
    };
  }

  return {
    get detail() {
      const current = host.get();
      return liveScoresChoices(host.cabinet()).find((c) => c.place === current)?.label ?? t('Automatique');
    },
    run: () => host.library.openCustom(build, Math.max(0, liveScoresChoices(host.cabinet()).findIndex((c) => c.place === host.get()))),
  };
}
