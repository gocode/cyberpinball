// Menu système > Amis > « Scores des amis pendant la partie » (essai réel du 31/10/2026 : « proposer
// dans la configuration des joueurs où ils veulent voir les scores des autres joueurs ») : deux
// réglages indépendants (essai du 04/11/2026). La place de la bande (LiveScoresPlace,
// packages/core/src/gamenotice.ts) : Automatique (le fronton, même pris par la table ; sinon le
// topper ; sinon le bas du plateau), ou une place au choix. Et « Scores sur le DMD », activé par
// défaut : les scores posés sur le DMD aux moments où il montre l'écran de score ; désactivé, plus
// rien sur le DMD. Chaque choix reste visible ; celui que la borne ne permet pas (pas de topper, DMD
// illisible…) est grisé avec sa raison. Les réglages valent pour toutes les tables : une place
// qu'une table ne permet pas revient à l'automatique, et le journal le dit. Ils se règlent ici, hors
// partie : pendant la partie, les boutons sont à VPX, et Cyber Pinball n'a pas de menu par-dessus.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un réglage d'essai.

import { liveScoresChoices, liveScoresDmdUnavailable, t, type IconName, type LiveScoresCabinet, type LiveScoresPlace, type LiveScoresSettings } from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row } from './library';
import { onGesture } from './gesture-flash';

export interface LiveScoresMenuHost {
  library: { openCustom(build: () => Built, at?: number): void; openSystem(): void };
  get(): LiveScoresSettings;
  set(settings: LiveScoresSettings): void;
  /** Ce que la borne permet : écrans, et l'inspector de VPX pour lire le DMD. */
  cabinet(): LiveScoresCabinet;
}

/** Une icône par action (jamais deux fois la même dans un écran). */
const ICONS: Record<LiveScoresPlace, IconName> = { auto: 'auto', backglass: 'frame', topper: 'layers', 'playfield-bottom': 'playfield', 'playfield-side': 'layout' };

export function createLiveScoresMenu(host: LiveScoresMenuHost): ProvidedSystemItem {
  let flash: Row | undefined;
  // Montré à chaque dessin jusqu'au geste suivant, jamais effacé par build() (gesture-flash.ts).
  onGesture(() => (flash = undefined));
  const dmdLabel = (on: boolean) => (on ? t('Scores sur le DMD : activés') : t('Scores sur le DMD : désactivés'));

  function build(): Built {
    const current = host.get();
    const cabinet = host.cabinet();
    const choices = liveScoresChoices(cabinet);
    const actions: Action[] = choices.map((c, i) => ({
      label: c.label,
      key: c.place,
      icon: ICONS[c.place],
      detail: c.unavailable ?? (c.place === current.place ? t('Choisi · {detail}', { detail: c.detail }) : c.detail),
      ...(c.unavailable ? { tone: 'quiet' as const } : c.place === current.place ? { tone: 'ok' as const } : {}),
      run: () => {
        if (c.unavailable) return;
        host.set({ ...host.get(), place: c.place });
        flash = { text: t('Scores des amis : {place}', { place: c.label }), tone: 'ok' };
        host.library.openCustom(build, i);
      },
    }));
    // Le second réglage : à part, activé par défaut, grisé avec sa raison quand le DMD ne se lit pas.
    const unavailable = liveScoresDmdUnavailable(cabinet);
    const dmdAt = actions.length;
    actions.push({
      label: dmdLabel(current.dmd),
      key: 'dmd',
      icon: 'dmd',
      detail: unavailable ?? (current.dmd ? t('Aux moments où il montre l’écran de score, jamais pendant une animation ni la saisie des initiales ; Start pour les désactiver') : t('Plus rien sur le DMD ; Start pour les activer')),
      ...(unavailable ? { tone: 'quiet' as const } : current.dmd ? { tone: 'ok' as const } : {}),
      run: () => {
        if (unavailable) return;
        const on = !host.get().dmd;
        host.set({ ...host.get(), dmd: on });
        flash = { text: dmdLabel(on), tone: 'ok' };
        host.library.openCustom(build, dmdAt);
      },
    });
    actions.push({ label: t('Retour'), icon: 'back', run: () => host.library.openSystem() });
    const shown = flash;
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
      const place = liveScoresChoices(host.cabinet()).find((c) => c.place === current.place)?.label ?? t('Automatique');
      return current.dmd && !liveScoresDmdUnavailable(host.cabinet()) ? t('{place} · et sur le DMD', { place }) : place;
    },
    run: () => host.library.openCustom(build, Math.max(0, liveScoresChoices(host.cabinet()).findIndex((c) => c.place === host.get().place))),
  };
}
