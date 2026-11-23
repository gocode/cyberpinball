// Mode débogage dans le front-end : l'entrée du Menu système (Ma borne > Santé et sauvegardes > Mode débogage) et son
// écran. Les mesures, la collecte et la fenêtre sont dans debogage.ts, la logique dans packages/core/src/debogage.ts.

import { debugModeLabel, debugScreenLabel, nextDebugMode, nextDebugScreen, SYSTEM_ITEMS, t } from '@cyberpinball/core';
import type { DebugController } from './debogage';
import type { createLibrary } from './library';

export function createDebugMenu(ctx: { debug: DebugController; library: ReturnType<typeof createLibrary> }) {
  const { debug, library } = ctx;

  library.provideSystemItem('debug-mode', {
    get detail() {
      const s = debug.settings();
      return s.mode === 'off' ? t('Désactivé · les mesures de tous les écrans, en direct, pour voir d’où vient un ralentissement') : t('{mode} · sur l’écran {screen}', { mode: debugModeLabel(s.mode), screen: debugScreenLabel(s.screen) });
    },
    run: () => openScreen(),
  });

  /** Écran « Mode débogage » : chaque réglage est une ligne, Start le change et le curseur reste dessus. */
  function openScreen(at = 0): void {
    const back = () => library.openSystem();
    library.openCustom(() => {
      const s = debug.settings();
      const change = (patch: Parameters<DebugController['update']>[0]) => {
        debug.update(patch);
        openScreen(library.cursor());
      };
      return {
        heading: SYSTEM_ITEMS['debug-mode'].label,
        icon: SYSTEM_ITEMS['debug-mode'].icon,
        lead: t('Les mesures de tous les écrans, en direct, par-dessus un seul d’entre eux : cadence, chargements, processeur, mémoire et carte graphique.'),
        sections: [],
        actions: [
          {
            label: t('Affichage : {mode}', { mode: debugModeLabel(s.mode) }),
            detail: t('Désactivé, compact (une ligne) ou détaillé'),
            icon: 'gauge' as const,
            run: () => change({ mode: nextDebugMode(s.mode) }),
          },
          {
            label: t('Écran : {screen}', { screen: debugScreenLabel(s.screen) }),
            detail: t('Le backglass, sinon le DMD, sinon le playfield ; ou l’écran de ton choix. Le DMD ne montre que la ligne compacte'),
            icon: 'screens' as const,
            run: () => change({ screen: nextDebugScreen(s.screen) }),
          },
          {
            label: s.inGame ? t('Pendant les parties : oui') : t('Pendant les parties : non'),
            detail: t('Par-dessus VPX, sans lui prendre la main ; jamais dans le casque. Sur le playfield, le détaillé est réduit'),
            icon: 'flipper' as const,
            run: () => change({ inGame: !s.inGame }),
          },
          {
            label: s.attach ? t('Joindre aux rapports : oui') : t('Joindre aux rapports : non'),
            detail: t('Les mesures des 10 dernières minutes partent avec le rapport technique quand tu signales un problème'),
            icon: 'report' as const,
            run: () => change({ attach: !s.attach }),
          },
          { label: t('Retour'), icon: 'back' as const, run: back },
        ],
        back,
      };
    }, at);
  }
}
