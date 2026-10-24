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
  formatNumber,
  nearestChoice,
  nextGameMediaMode,
  t,
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

const heading = () => t('Médias, son et attente');
// La présentation du menu (une des quatre roues, ou la liste) est rangée ici aussi : c'est un réglage du menu, gardé dans medias.json.

const LAYOUT_DETAILS: Record<MenuLayout, string> = {
  get medaillons() {
    return t('Médaillons sur un bandeau de verre éclairé au néon, la table choisie au centre dans un anneau vert');
  },
  get bandeau() {
    return t('Cinq médaillons sur une lame de verre droite bordée de néon, le titre dessous');
  },
  get minimal() {
    return t('Cinq médaillons sur un simple filet lumineux : la table reste dégagée');
  },
  get arche() {
    return t('Cinq médaillons le long d’une arche de métal et de verre, comme un fronton');
  },
  get list() {
    return t('Titres des tables les uns sous les autres, la table choisie au milieu');
  },
};

/** Libellé d'une présentation en tête de ligne : « roue Médaillons » devient « Roue Médaillons ». */
const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

type VolumeKey = 'musicVolume' | 'videoVolume' | 'launchVolume';
type ChoiceKey = 'attractDelay' | 'attractInterval';

export function createMenuSettings(host: MenuSettingsHost): SystemItem {
  const s = () => host.settings();
  const set = (patch: Partial<MenuMediaSettings>) => host.save({ ...s(), ...patch });

  function gameDetail(): string {
    const mode = s().game;
    return mode === 'still'
      ? t('Première image du jeu sur les écrans que VPX n’occupe pas (Start : changer)')
      : mode === 'animated'
        ? t('Vidéos du jeu sur les écrans que VPX n’occupe pas ; plus de travail pour la carte graphique (Start : changer)')
        : t('Écrans que VPX n’occupe pas laissés noirs (Start : changer)');
  }

  function actions(): Action[] {
    const v = s();
    return [
      {
        label: t('Présentation du menu : {layout}', { layout: MENU_LAYOUT_LABELS[v.menuLayout] }),
        detail: t('{detail} (Start : choisir)', { detail: LAYOUT_DETAILS[v.menuLayout] }),
        run: () => openLayout(),
      },
      {
        label: v.music ? t('Musique des jeux : jouée') : t('Musique des jeux : coupée'),
        detail: v.music ? t('Musique du jeu choisi pendant la navigation (Start : couper)') : t('Borne silencieuse dans le menu (Start : jouer la musique de chaque jeu)'),
        run: () => set({ music: !v.music }),
      },
      {
        label: t('Volume de la musique : {volume}', { volume: volumeLabel(v.musicVolume) }),
        detail: v.music ? undefined : t('Musique coupée pour l’instant'),
        run: () => openVolume('musicVolume', 1),
      },
      {
        label: t('Son des vidéos du menu : {volume}', { volume: volumeLabel(v.videoVolume) }),
        detail: t('Vidéo du plateau, quand le jeu n’a pas de musique ou qu’elle est coupée'),
        run: () => openVolume('videoVolume', 2),
      },
      {
        label: t('Volume du lancement : {volume}', { volume: volumeLabel(v.launchVolume) }),
        detail: t('Son de lancement du jeu, sinon son de sa vidéo de chargement'),
        run: () => openVolume('launchVolume', 3),
      },
      {
        label: t('Mode attente : {delay}', { delay: attractDelayLabel(v.attractDelay) }),
        detail: t('Tables tirées au hasard avec leurs médias ; n’importe quel bouton revient au menu'),
        run: () => openChoice('attractDelay', ATTRACT_DELAY_CHOICES, (x) => (x ? t('Après {duration} sans bouton', { duration: durationLabel(x) }) : t('Jamais')), 4),
      },
      {
        label: t('Table suivante en attente : toutes les {duration}', { duration: durationLabel(v.attractInterval) }),
        run: () => openChoice('attractInterval', ATTRACT_INTERVAL_CHOICES, (x) => t('Toutes les {duration}', { duration: durationLabel(x) }), 5),
      },
      {
        label: v.attractSound === 'reduced' ? t('Son en attente : réduit') : t('Son en attente : coupé'),
        detail: v.attractSound === 'reduced' ? t('Musique et vidéos à 30 % de leur volume (Start : couper)') : t('Rien ne joue en attente (Start : son réduit)'),
        run: () => set({ attractSound: v.attractSound === 'reduced' ? 'muted' : 'reduced' }),
      },
      { label: t('Médias pendant la partie : {mode}', { mode: GAME_MEDIA_LABELS[v.game] }), detail: gameDetail(), run: () => set({ game: nextGameMediaMode(v.game) }) },
      {
        label: t('Qualité téléchargée (VPinMediaDB) : {quality}', { quality: MEDIADB_QUALITY_LABELS[v.downloadQuality] }),
        detail:
          v.downloadQuality === 'auto'
            ? t('4k si l’écran du plateau dépasse {pixels} points, 1k sinon ; seule l’image du plateau existe en 4k (Start : changer)', { pixels: formatNumber(MEDIADB_4K_ABOVE) })
            : v.downloadQuality === '4k'
              ? t('Image du plateau en 4k, environ 4 fois plus lourde (Start : changer)')
              : t('Image du plateau en 1k, la plus légère (Start : changer)'),
        run: () => set({ downloadQuality: MEDIADB_QUALITY_SETTINGS[(MEDIADB_QUALITY_SETTINGS.indexOf(v.downloadQuality) + 1) % MEDIADB_QUALITY_SETTINGS.length]! }),
      },
    ];
  }

  function build(): Built {
    const output = host.output();
    return {
      heading: heading(),
      lead: t('Sortie du son : {output}. Volume propre à un jeu : sa fiche, « Médias du jeu ».', {
        output: output ?? t('sortie par défaut de Windows (aucune sortie affectée au fronton par l’assistant)'),
      }),
      sections: [],
      actions: [...actions(), { label: t('Retour'), run: () => host.library.openSystem() }],
      back: () => host.library.openSystem(),
    };
  }

  function open(at = 0): void {
    host.library.openCustom(build, at);
  }

  function volumeTitles(key: VolumeKey): { heading: string; lead: string } {
    switch (key) {
      case 'musicVolume':
        return { heading: t('Volume de la musique'), lead: t('Musique du jeu choisi pendant la navigation, avant le volume propre à chaque jeu.') };
      case 'videoVolume':
        return { heading: t('Son des vidéos du menu'), lead: t('Son de la vidéo du plateau, quand le jeu n’a pas de musique ou qu’elle est coupée. 0 % : vidéos muettes.') };
      case 'launchVolume':
        return { heading: t('Volume du lancement'), lead: t('Son joué au lancement d’une table, ou son de sa vidéo de chargement. Rien pendant la partie : VPX a la parole.') };
    }
  }

  function openVolume(key: VolumeKey, back: number): void {
    const now = s()[key];
    host.library.openCustom(
      () => ({
        ...volumeTitles(key),
        sections: [],
        actions: [
          ...VOLUME_CHOICES.map((value) => ({
            label: volumeLabel(value),
            detail: value === s()[key] ? t('choix actuel') : undefined,
            tone: value === s()[key] ? ('ok' as const) : undefined,
            run: () => {
              set({ [key]: value });
              open(back);
            },
          })),
          { label: t('Retour'), run: () => open(back) },
        ],
        back: () => open(back),
      }),
      Math.max(0, VOLUME_CHOICES.indexOf(nearestChoice(VOLUME_CHOICES, now))),
    );
  }

  function openLayout(): void {
    host.library.openCustom(
      () => ({
        heading: t('Présentation du menu'),
        lead: t('Comment les tables défilent dans le menu. Les roues font glisser les logos d’une place à l’autre ; la liste montre les titres.'),
        sections: [],
        actions: [
          ...MENU_LAYOUTS.map((layout) => ({
            label: capitalized(MENU_LAYOUT_LABELS[layout]),
            detail: layout === s().menuLayout ? t('{detail} · choix actuel', { detail: LAYOUT_DETAILS[layout] }) : LAYOUT_DETAILS[layout],
            tone: layout === s().menuLayout ? ('ok' as const) : undefined,
            run: () => {
              set({ menuLayout: layout });
              open(0);
            },
          })),
          { label: t('Retour'), run: () => open(0) },
        ],
        back: () => open(0),
      }),
      Math.max(0, MENU_LAYOUTS.indexOf(s().menuLayout)),
    );
  }

  function choiceTitles(key: ChoiceKey): { heading: string; lead: string } {
    return key === 'attractDelay'
      ? { heading: t('Mode attente'), lead: t('Après ce temps sans bouton sur le menu des tables, la borne présente des tables au hasard. Le premier bouton revient au menu, sans rien lancer.') }
      : { heading: t('Table suivante en attente'), lead: t('Temps passé sur chaque table tirée au hasard.') };
  }

  function openChoice(key: ChoiceKey, choices: readonly number[], label: (value: number) => string, back: number): void {
    const now = s()[key];
    host.library.openCustom(
      () => ({
        ...choiceTitles(key),
        sections: [],
        actions: [
          ...choices.map((value) => ({
            label: label(value),
            detail: value === s()[key] ? t('choix actuel') : undefined,
            tone: value === s()[key] ? ('ok' as const) : undefined,
            run: () => {
              set({ [key]: value });
              open(back);
            },
          })),
          { label: t('Retour'), run: () => open(back) },
        ],
        back: () => open(back),
      }),
      Math.max(0, choices.indexOf(nearestChoice(choices, now))),
    );
  }

  return {
    get label() {
      return heading();
    },
    get detail() {
      const v = s();
      const params = { delay: attractDelayLabel(v.attractDelay), mode: GAME_MEDIA_LABELS[v.game] };
      return v.music
        ? t('Musique jouée ({volume} %) · attente : {delay} · médias pendant la partie : {mode}', { ...params, volume: v.musicVolume })
        : t('Musique coupée · attente : {delay} · médias pendant la partie : {mode}', params);
    },
    run: () => open(),
  };
}
