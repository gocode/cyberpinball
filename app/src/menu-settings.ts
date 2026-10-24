// Réglages des médias, du son et du mode attente du menu (docs/recherche/medias.md, § 5.4),
// dans le menu système : musique des jeux, volumes, mode attente, médias pendant la
// partie, qualité téléchargée depuis VPinMediaDB. Tout se règle aux
// boutons : Start change un choix ou ouvre la liste des valeurs, Exit revient.
// Les réglages s'appliquent tout de suite (on entend le nouveau volume) et sont gardés
// dans <données>\medias.json.

import {
  ATTRACT_DELAY_CHOICES,
  ATTRACT_INTERVAL_CHOICES,
  GAME_MEDIA_LABELS,
  MENU_LAYOUT_LABELS,
  MENU_LAYOUTS,
  MEDIADB_4K_ABOVE,
  MEDIADB_QUALITY_LABELS,
  MEDIADB_QUALITY_SETTINGS,
  VOLUME_CHOICES,
  attractDelayLabel,
  durationLabel,
  nearestChoice,
  nextGameMediaMode,
  volumeLabel,
  type MenuLayout,
  type MenuMediaSettings,
} from '@cyberpinball/core';
import type { Action, Built, SystemItem } from './library';

export interface MenuSettingsHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  settings(): MenuMediaSettings;
  /** Enregistre et applique (état renvoyé aux fenêtres). */
  save(next: MenuMediaSettings): void;
  /** Nom Windows de la sortie audio du menu ; undefined : sortie par défaut. */
  output(): string | undefined;
}

const HEADING = 'Médias, son et attente';
// La présentation du menu (une des quatre roues, ou la liste) est rangée ici aussi : c'est un réglage du menu, gardé dans medias.json.

const LAYOUT_DETAILS: Record<MenuLayout, string> = {
  medaillons: 'Médaillons sur un bandeau de verre éclairé au néon, la table choisie au centre dans un anneau vert',
  bandeau: 'Cinq médaillons sur une lame de verre droite bordée de néon, le titre dessous',
  minimal: 'Cinq médaillons sur un simple filet lumineux : la table reste dégagée',
  arche: 'Cinq médaillons le long d’une arche de métal et de verre, comme un fronton',
  list: 'Titres des tables les uns sous les autres, la table choisie au milieu',
};

type VolumeKey = 'musicVolume' | 'videoVolume' | 'launchVolume';
type ChoiceKey = 'attractDelay' | 'attractInterval';

export function createMenuSettings(host: MenuSettingsHost): SystemItem {
  const s = () => host.settings();
  const set = (patch: Partial<MenuMediaSettings>) => host.save({ ...s(), ...patch });

  function gameDetail(): string {
    const mode = s().game;
    return mode === 'still'
      ? 'Première image du jeu sur les écrans que VPX n’occupe pas (Start : changer)'
      : mode === 'animated'
        ? 'Vidéos du jeu sur les écrans que VPX n’occupe pas ; plus de travail pour la carte graphique (Start : changer)'
        : 'Écrans que VPX n’occupe pas laissés noirs (Start : changer)';
  }

  function actions(): Action[] {
    const v = s();
    return [
      {
        label: `Présentation du menu : ${MENU_LAYOUT_LABELS[v.menuLayout]}`,
        detail: `${LAYOUT_DETAILS[v.menuLayout]} (Start : choisir)`,
        run: () => openLayout(),
      },
      {
        label: `Musique des jeux : ${v.music ? 'jouée' : 'coupée'}`,
        detail: v.music ? 'Musique du jeu choisi pendant la navigation (Start : couper)' : 'Borne silencieuse dans le menu (Start : jouer la musique de chaque jeu)',
        run: () => set({ music: !v.music }),
      },
      { label: `Volume de la musique : ${volumeLabel(v.musicVolume)}`, detail: v.music ? undefined : 'Musique coupée pour l’instant', run: () => openVolume('musicVolume', 1) },
      { label: `Son des vidéos du menu : ${volumeLabel(v.videoVolume)}`, detail: 'Vidéo du plateau, quand le jeu n’a pas de musique ou qu’elle est coupée', run: () => openVolume('videoVolume', 2) },
      { label: `Volume du lancement : ${volumeLabel(v.launchVolume)}`, detail: 'Son de lancement du jeu, sinon son de sa vidéo de chargement', run: () => openVolume('launchVolume', 3) },
      {
        label: `Mode attente : ${attractDelayLabel(v.attractDelay)}`,
        detail: 'Tables tirées au hasard avec leurs médias ; n’importe quel bouton revient au menu',
        run: () => openChoice('attractDelay', ATTRACT_DELAY_CHOICES, (x) => (x ? `Après ${durationLabel(x)} sans bouton` : 'Jamais'), 4),
      },
      {
        label: `Table suivante en attente : toutes les ${durationLabel(v.attractInterval)}`,
        run: () => openChoice('attractInterval', ATTRACT_INTERVAL_CHOICES, (x) => `Toutes les ${durationLabel(x)}`, 5),
      },
      {
        label: `Son en attente : ${v.attractSound === 'reduced' ? 'réduit' : 'coupé'}`,
        detail: v.attractSound === 'reduced' ? 'Musique et vidéos à 30 % de leur volume (Start : couper)' : 'Rien ne joue en attente (Start : son réduit)',
        run: () => set({ attractSound: v.attractSound === 'reduced' ? 'muted' : 'reduced' }),
      },
      { label: `Médias pendant la partie : ${GAME_MEDIA_LABELS[v.game]}`, detail: gameDetail(), run: () => set({ game: nextGameMediaMode(v.game) }) },
      {
        label: `Qualité téléchargée (VPinMediaDB) : ${MEDIADB_QUALITY_LABELS[v.downloadQuality]}`,
        detail:
          v.downloadQuality === 'auto'
            ? `4k si l’écran du plateau dépasse ${MEDIADB_4K_ABOVE.toLocaleString('fr-FR')} points, 1k sinon ; seule l’image du plateau existe en 4k (Start : changer)`
            : v.downloadQuality === '4k'
              ? 'Image du plateau en 4k, environ 4 fois plus lourde (Start : changer)'
              : 'Image du plateau en 1k, la plus légère (Start : changer)',
        run: () => set({ downloadQuality: MEDIADB_QUALITY_SETTINGS[(MEDIADB_QUALITY_SETTINGS.indexOf(v.downloadQuality) + 1) % MEDIADB_QUALITY_SETTINGS.length]! }),
      },
    ];
  }

  function build(): Built {
    const output = host.output();
    return {
      heading: HEADING,
      lead: `Sortie du son : ${output ?? 'sortie par défaut de Windows (aucune sortie affectée au fronton par l’assistant)'}. Volume propre à un jeu : sa fiche, « Médias du jeu ».`,
      sections: [],
      actions: [...actions(), { label: 'Retour', run: () => host.library.openSystem() }],
      back: () => host.library.openSystem(),
    };
  }

  function open(at = 0): void {
    host.library.openCustom(build, at);
  }

  const VOLUME_TITLES: Record<VolumeKey, { heading: string; lead: string }> = {
    musicVolume: { heading: 'Volume de la musique', lead: 'Musique du jeu choisi pendant la navigation, avant le volume propre à chaque jeu.' },
    videoVolume: { heading: 'Son des vidéos du menu', lead: 'Son de la vidéo du plateau, quand le jeu n’a pas de musique ou qu’elle est coupée. 0 % : vidéos muettes.' },
    launchVolume: { heading: 'Volume du lancement', lead: 'Son joué au lancement d’une table, ou son de sa vidéo de chargement. Rien pendant la partie : VPX a la parole.' },
  };

  function openVolume(key: VolumeKey, back: number): void {
    const now = s()[key];
    host.library.openCustom(
      () => ({
        heading: VOLUME_TITLES[key].heading,
        lead: VOLUME_TITLES[key].lead,
        sections: [],
        actions: [
          ...VOLUME_CHOICES.map((value) => ({
            label: volumeLabel(value),
            detail: value === s()[key] ? 'choix actuel' : undefined,
            tone: value === s()[key] ? ('ok' as const) : undefined,
            run: () => {
              set({ [key]: value });
              open(back);
            },
          })),
          { label: 'Retour', run: () => open(back) },
        ],
        back: () => open(back),
      }),
      Math.max(0, VOLUME_CHOICES.indexOf(nearestChoice(VOLUME_CHOICES, now))),
    );
  }

  function openLayout(): void {
    host.library.openCustom(
      () => ({
        heading: 'Présentation du menu',
        lead: 'Comment les tables défilent dans le menu. Les roues font glisser les logos d’une place à l’autre ; la liste montre les titres.',
        sections: [],
        actions: [
          ...MENU_LAYOUTS.map((layout) => ({
            label: MENU_LAYOUT_LABELS[layout].replace(/^roue /, 'Roue ').replace(/^liste$/, 'Liste'),
            detail: layout === s().menuLayout ? `${LAYOUT_DETAILS[layout]} · choix actuel` : LAYOUT_DETAILS[layout],
            tone: layout === s().menuLayout ? ('ok' as const) : undefined,
            run: () => {
              set({ menuLayout: layout });
              open(0);
            },
          })),
          { label: 'Retour', run: () => open(0) },
        ],
        back: () => open(0),
      }),
      Math.max(0, MENU_LAYOUTS.indexOf(s().menuLayout)),
    );
  }

  const CHOICE_TITLES: Record<ChoiceKey, { heading: string; lead: string }> = {
    attractDelay: { heading: 'Mode attente', lead: 'Après ce temps sans bouton sur le menu des tables, la borne présente des tables au hasard. Le premier bouton revient au menu, sans rien lancer.' },
    attractInterval: { heading: 'Table suivante en attente', lead: 'Temps passé sur chaque table tirée au hasard.' },
  };

  function openChoice(key: ChoiceKey, choices: readonly number[], label: (value: number) => string, back: number): void {
    const now = s()[key];
    host.library.openCustom(
      () => ({
        heading: CHOICE_TITLES[key].heading,
        lead: CHOICE_TITLES[key].lead,
        sections: [],
        actions: [
          ...choices.map((value) => ({
            label: label(value),
            detail: value === s()[key] ? 'choix actuel' : undefined,
            tone: value === s()[key] ? ('ok' as const) : undefined,
            run: () => {
              set({ [key]: value });
              open(back);
            },
          })),
          { label: 'Retour', run: () => open(back) },
        ],
        back: () => open(back),
      }),
      Math.max(0, choices.indexOf(nearestChoice(choices, now))),
    );
  }

  return {
    label: HEADING,
    get detail() {
      const v = s();
      return `Musique ${v.music ? `jouée (${v.musicVolume} %)` : 'coupée'} · attente : ${attractDelayLabel(v.attractDelay)} · médias pendant la partie : ${GAME_MEDIA_LABELS[v.game]}`;
    },
    run: () => open(),
  };
}
