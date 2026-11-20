// Vues de l'étape « Son de la borne » pour les configurations proposées (packages/core/src/
// audio-setups.ts) : la liste, le schéma de la borne vue de dessus, et la vérification rapide d'une
// configuration (chaque paire sonne-t-elle là où on l'attend ?). Dessinées par
// app/renderer/sound-setups.js. L'assistant (wizard.ts) garde l'état et les touches.

import { t, type AudioSetup, type SchemaSpot, type SpeakerPair, type SpeakerPlace } from '@cyberpinball/core';

/** Une place du schéma telle que le rendu la dessine. */
export interface CabinetSpot extends SchemaSpot {
  /** Ce qui sonne en ce moment : les deux côtés. */
  active?: boolean;
  /** Déjà vérifiée (coche), ou pas encore (atténuée). */
  check?: 'done' | 'pending';
}

export interface CabinetView {
  fronton?: CabinetSpot;
  haut?: CabinetSpot;
  bas?: CabinetSpot;
  /** Libellés des places, traduits. */
  labels: { fronton: string; haut: string; bas: string; you: string; empty: string; absent: string };
}

export interface SetupsView {
  items: { title: string; detail?: string; badges: AudioSetup['badges']; selected: boolean; quiet?: boolean }[];
  cabinet?: CabinetView;
}

const labels = (): CabinetView['labels'] => ({
  fronton: t('Fronton'),
  haut: t('Près du fronton'),
  bas: t('Près de vous'),
  you: t('VOUS'),
  empty: t('rien de branché'),
  absent: t('{source} non branchée'),
});

/** Place du schéma où une paire doit sonner. */
const SPOT_OF: Partial<Record<SpeakerPlace, 'fronton' | 'haut' | 'bas'>> = { backglass: 'fronton', top: 'haut', lockbar: 'bas' };

/** La liste des propositions, « pas à pas » en dernier, et le schéma de celle qui est choisie. */
export function setupsView(list: readonly AudioSetup[], index: number): SetupsView {
  const items: SetupsView['items'] = list.map((s, i) => ({ title: s.title, detail: s.detail, badges: s.badges, selected: i === index }));
  items.push({
    title: t('Aucune ne correspond : régler pas à pas'),
    detail: t('Chaque sortie sonne, vous dites où vous l’entendez'),
    badges: [],
    selected: index >= list.length,
    quiet: true,
  });
  const chosen = list[index];
  const schema = chosen?.schema;
  return { items, ...(schema && Object.keys(schema).length && { cabinet: { ...schema, labels: labels() } }) };
}

/**
 * Schéma de la vérification rapide : la paire en cours allumée, celles déjà vérifiées cochées,
 * les suivantes atténuées.
 */
export function quickCheckCabinet(setup: AudioSetup, pairs: readonly SpeakerPair[], current: number): CabinetView {
  const view: CabinetView = { ...setup.schema, labels: labels() };
  for (const key of ['fronton', 'haut', 'bas'] as const) if (view[key]) view[key] = { ...view[key]! };
  pairs.forEach((pair, i) => {
    const spot = SPOT_OF[setup.expected?.[pair] ?? 'none'];
    if (!spot || !view[spot]) return;
    view[spot] = { ...view[spot]!, ...(i === current ? { active: true } : { check: i < current ? 'done' : 'pending' }) };
  });
  return view;
}

/** Ce que demande la vérification rapide pour une paire attendue à `place`. */
export function quickCheckTexts(place: SpeakerPlace): { step: string; yes: string } {
  switch (place) {
    case 'backglass':
      return { step: t('Un son à gauche, puis à droite : l’entendez-vous dans le fronton, des deux côtés ?'), yes: t('Oui, dans le fronton') };
    case 'top':
      return { step: t('Un son à gauche, puis à droite : vibrent-ils sous le plateau, près du fronton ?'), yes: t('Oui, près du fronton') };
    default:
      return { step: t('Un son à gauche, puis à droite : vibrent-ils sous le plateau, près de vous ?'), yes: t('Oui, près de moi') };
  }
}
