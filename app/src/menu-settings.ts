// Réglages des médias, du son et du mode attente du menu (docs/recherche/medias.md, § 5.4),
// dans le menu système : musique des jeux, volumes, lancement en cinéma, mode attente et
// horaire de la borne (nuit voilée, arrêt à heure fixe : packages/core/src/arcadehours.ts),
// médias pendant la partie, DMD du menu (vivant ou classique), qualité téléchargée depuis VPinMediaDB.
// Tout se règle aux boutons : Start change un choix ou ouvre la liste des valeurs, Exit revient.
// Les réglages s'appliquent tout de suite (on entend le nouveau volume) et sont gardés
// dans <données>\medias.json.

import {
  ATTRACT_DELAY_CHOICES,
  ATTRACT_INTERVAL_CHOICES,
  HOUR_CHOICES,
  NIGHT_DIM_CHOICES,
  GAME_MEDIA_LABELS,
  MENU_DMD_LABELS,
  MENU_LAYOUT_LABELS,
  MENU_LAYOUTS,
  MEDIADB_4K_ABOVE,
  MEDIADB_QUALITY_LABELS,
  MEDIADB_QUALITY_SETTINGS,
  VOLUME_CHOICES,
  arcadeHoursSummary,
  attractDelayLabel,
  durationLabel,
  hourLabel,
  formatNumber,
  nearestChoice,
  nextGameMediaMode,
  nightDimLabel,
  stopActionLabel,
  stopInNight,
  t,
  volumeLabel,
  type ArcadeHoursSettings,
  type IconName,
  type MenuLayout,
  type MenuMediaSettings,
  type UiSoundId,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row as SectionRow } from './library';

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
  /** Fait entendre un son de l'interface (réglage tout juste changé), s'il est permis. */
  preview(id: UiSoundId): void;
  /**
   * Périphériques que Windows autorise à réveiller le PC (boutons, clavier, souris), lus sans
   * rien écrire ; undefined tant que la lecture n'a pas répondu (l'écran se redessine alors),
   * null si Windows n'a pas répondu.
   */
  wakeDevices(): readonly string[] | null | undefined;
  /** La veille est-elle possible sur ce PC (pas de veille moderne seule) ? */
  sleepAllowed(): boolean;
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

type VolumeKey = 'musicVolume' | 'videoVolume' | 'launchVolume' | 'uiSoundsVolume';
type ChoiceKey = 'attractDelay' | 'attractInterval';

/**
 * Lignes de l'écran, dans l'ordre : un sous-écran revient sur sa ligne par son rang, tiré
 * d'ici (une ligne ajoutée ne décale plus les retours).
 */
export const MENU_SETTINGS_ROWS = [
  'menuLayout',
  'music',
  'musicVolume',
  'videoVolume',
  'launchVolume',
  'cinema',
  'uiSounds',
  'uiSoundsVolume',
  'attractDelay',
  'attractInterval',
  'attractSound',
  'hours',
  'game',
  'dmd',
  'downloadQuality',
] as const;
type Row = (typeof MENU_SETTINGS_ROWS)[number];
const row = (key: Row) => MENU_SETTINGS_ROWS.indexOf(key);

export function createMenuSettings(host: MenuSettingsHost): ProvidedSystemItem {
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
    const rows: Record<Row, Action> = {
      menuLayout: {
        label: t('Présentation du menu : {layout}', { layout: MENU_LAYOUT_LABELS[v.menuLayout] }),
        detail: t('{detail} (Start : choisir)', { detail: LAYOUT_DETAILS[v.menuLayout] }),
        icon: 'layout-menu',
        run: () => openLayout(),
      },
      music: {
        label: v.music ? t('Musique des jeux : jouée') : t('Musique des jeux : coupée'),
        detail: v.music ? t('Musique du jeu choisi pendant la navigation (Start : couper)') : t('Borne silencieuse dans le menu (Start : jouer la musique de chaque jeu)'),
        icon: 'music',
        run: () => set({ music: !v.music }),
      },
      musicVolume: {
        label: t('Volume de la musique : {volume}', { volume: volumeLabel(v.musicVolume) }),
        detail: v.music ? undefined : t('Musique coupée pour l’instant'),
        icon: 'volume',
        run: () => openVolume('musicVolume'),
      },
      videoVolume: {
        label: t('Son des vidéos du menu : {volume}', { volume: volumeLabel(v.videoVolume) }),
        detail: t('Vidéo du plateau, quand le jeu n’a pas de musique ou qu’elle est coupée'),
        icon: 'video',
        run: () => openVolume('videoVolume'),
      },
      launchVolume: {
        label: t('Volume du lancement : {volume}', { volume: volumeLabel(v.launchVolume) }),
        detail: t('Son de lancement du jeu, sinon son de sa vidéo de chargement'),
        icon: 'rocket',
        run: () => openVolume('launchVolume'),
      },
      cinema: {
        label: v.cinema ? t('Lancement en cinéma : joué') : t('Lancement en cinéma : coupé'),
        detail: v.cinema
          ? t('Au Start, le logo du jeu s’envole du plateau vers le fronton, le DMD charge, un coup de bobine quand VPX prend la main ; VPX n’attend jamais (Start : couper)')
          : t('Le chargement seul, sans logo ni coup de bobine (Start : jouer le lancement en cinéma)'),
        icon: 'plunger',
        run: () => {
          set({ cinema: !v.cinema });
          // Rétabli : le coup de bobine se fait entendre (s'il est permis : sons de l'interface joués).
          if (!v.cinema) host.preview('coil');
        },
      },
      uiSounds: {
        label: v.uiSounds ? t('Sons de l’interface : joués') : t('Sons de l’interface : coupés'),
        detail: v.uiSounds
          ? t('Clic de solénoïde au changement de table, pièce au Start, knocker sur un record, coup de bobine au lancement en cinéma ; rien pendant la partie (Start : couper)')
          : t('Aucun bruit de flipper dans le menu (Start : les jouer)'),
        icon: 'flipper',
        run: () => {
          set({ uiSounds: !v.uiSounds });
          host.preview('solenoid');
        },
      },
      uiSoundsVolume: {
        label: t('Volume des sons de l’interface : {volume}', { volume: volumeLabel(v.uiSoundsVolume) }),
        detail: v.uiSounds ? undefined : t('Sons de l’interface coupés pour l’instant'),
        icon: 'sound',
        run: () => openVolume('uiSoundsVolume'),
      },
      attractDelay: {
        label: t('Mode attente : {delay}', { delay: attractDelayLabel(v.attractDelay) }),
        detail: t('Tables tirées au hasard avec leurs médias ; n’importe quel bouton revient au menu'),
        icon: 'attract',
        run: () => openChoice('attractDelay', ATTRACT_DELAY_CHOICES, (x) => (x ? t('Après {duration} sans bouton', { duration: durationLabel(x) }) : t('Jamais'))),
      },
      attractInterval: {
        label: t('Table suivante en attente : toutes les {duration}', { duration: durationLabel(v.attractInterval) }),
        icon: 'shuffle',
        run: () => openChoice('attractInterval', ATTRACT_INTERVAL_CHOICES, (x) => t('Toutes les {duration}', { duration: durationLabel(x) })),
      },
      attractSound: {
        label: v.attractSound === 'reduced' ? t('Son en attente : réduit') : t('Son en attente : coupé'),
        detail: v.attractSound === 'reduced' ? t('Musique et vidéos à 30 % de leur volume (Start : couper)') : t('Rien ne joue en attente (Start : son réduit)'),
        icon: 'volume-low',
        run: () => set({ attractSound: v.attractSound === 'reduced' ? 'muted' : 'reduced' }),
      },
      hours: {
        label: t('Horaire de la borne : {summary}', { summary: arcadeHoursSummary(v.hours) }),
        detail:
          v.hours.on && v.attractDelay === 0
            ? t('Mode attente réglé sur « jamais » : pas de voile la nuit ; l’arrêt attend {minutes} min sans bouton (Start : régler)', { minutes: 5 })
            : t('Attente muette et écrans assombris la nuit, arrêt automatique (Start : régler)'),
        icon: 'clock',
        run: () => openHours(),
      },
      game: { label: t('Médias pendant la partie : {mode}', { mode: GAME_MEDIA_LABELS[v.game] }), detail: gameDetail(), icon: 'film', run: () => set({ game: nextGameMediaMode(v.game) }) },
      dmd: {
        label: t('DMD du menu : {mode}', { mode: MENU_DMD_LABELS[v.dmd] }),
        detail:
          v.dmd === 'live'
            ? t('Cyber Pinball dessine l’afficheur : titre, records, PRESS START, horloge, crédits, puis le média DMD du jeu (Start : média seul)')
            : t('Le média DMD du jeu, sinon son titre qui défile (Start : DMD vivant)'),
        icon: 'dmd',
        run: () => set({ dmd: v.dmd === 'live' ? 'classic' : 'live' }),
      },
      downloadQuality: {
        label: t('Qualité téléchargée (VPinMediaDB) : {quality}', { quality: MEDIADB_QUALITY_LABELS[v.downloadQuality] }),
        icon: 'quality',
        detail:
          v.downloadQuality === 'auto'
            ? t('4k si l’écran du plateau dépasse {pixels} points, 1k sinon ; seule l’image du plateau existe en 4k (Start : changer)', { pixels: formatNumber(MEDIADB_4K_ABOVE) })
            : v.downloadQuality === '4k'
              ? t('Image du plateau en 4k, environ 4 fois plus lourde (Start : changer)')
              : t('Image du plateau en 1k, la plus légère (Start : changer)'),
        run: () => set({ downloadQuality: MEDIADB_QUALITY_SETTINGS[(MEDIADB_QUALITY_SETTINGS.indexOf(v.downloadQuality) + 1) % MEDIADB_QUALITY_SETTINGS.length]! }),
      },
    };
    return MENU_SETTINGS_ROWS.map((key) => rows[key]);
  }

  function build(): Built {
    const output = host.output();
    return {
      heading: heading(),
      icon: 'music',
      lead: t('Sortie du son : {output}. Volume propre à un jeu : sa fiche, « Médias du jeu ».', {
        output: output ?? t('sortie par défaut de Windows (aucune sortie affectée au fronton par l’assistant)'),
      }),
      sections: [],
      actions: [...actions(), { label: t('Retour'), icon: 'back', run: () => host.library.openSystem() }],
      back: () => host.library.openSystem(),
    };
  }

  function open(at = 0): void {
    host.library.openCustom(build, at);
  }

  function volumeTitles(key: VolumeKey): { heading: string; icon: IconName; lead: string } {
    switch (key) {
      case 'musicVolume':
        return { heading: t('Volume de la musique'), icon: 'volume', lead: t('Musique du jeu choisi pendant la navigation, avant le volume propre à chaque jeu.') };
      case 'videoVolume':
        return { heading: t('Son des vidéos du menu'), icon: 'video', lead: t('Son de la vidéo du plateau, quand le jeu n’a pas de musique ou qu’elle est coupée. 0 % : vidéos muettes.') };
      case 'launchVolume':
        return { heading: t('Volume du lancement'), icon: 'rocket', lead: t('Son joué au lancement d’une table, ou son de sa vidéo de chargement. Rien pendant la partie : VPX a la parole.') };
      case 'uiSoundsVolume':
        return { heading: t('Volume des sons de l’interface'), icon: 'sound', lead: t('Clic de solénoïde, pièce, knocker et coup de bobine, sur la sortie du son du menu. Rien pendant la partie : VPX a la parole.') };
    }
  }

  function openVolume(key: VolumeKey): void {
    const back = row(key);
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
              if (key === 'uiSoundsVolume') host.preview('coin');
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
        icon: 'layout-menu',
        lead: t('Comment les tables défilent dans le menu. Les roues font glisser les logos d’une place à l’autre ; la liste montre les titres.'),
        sections: [],
        actions: [
          ...MENU_LAYOUTS.map((layout) => ({
            label: capitalized(MENU_LAYOUT_LABELS[layout]),
            detail: layout === s().menuLayout ? t('{detail} · choix actuel', { detail: LAYOUT_DETAILS[layout] }) : LAYOUT_DETAILS[layout],
            tone: layout === s().menuLayout ? ('ok' as const) : undefined,
            run: () => {
              set({ menuLayout: layout });
              open(row('menuLayout'));
            },
          })),
          { label: t('Retour'), run: () => open(row('menuLayout')) },
        ],
        back: () => open(row('menuLayout')),
      }),
      Math.max(0, MENU_LAYOUTS.indexOf(s().menuLayout)),
    );
  }

  function choiceTitles(key: ChoiceKey): { heading: string; icon: IconName; lead: string } {
    return key === 'attractDelay'
      ? { heading: t('Mode attente'), icon: 'attract', lead: t('Après ce temps sans bouton sur le menu des tables, la borne présente des tables au hasard. Le premier bouton revient au menu, sans rien lancer.') }
      : { heading: t('Table suivante en attente'), icon: 'shuffle', lead: t('Temps passé sur chaque table tirée au hasard.') };
  }

  function openChoice(key: ChoiceKey, choices: readonly number[], label: (value: number) => string): void {
    const back = row(key);
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

  // ---------- Horaire de la borne ----------

  const HOURS_ROWS = ['on', 'nightFrom', 'nightTo', 'nightDim', 'stopAt', 'stopBy'] as const;
  type HoursRow = (typeof HOURS_ROWS)[number];
  type HourKey = 'nightFrom' | 'nightTo' | 'stopAt';
  const h = () => s().hours;
  const setHours = (patch: Partial<ArcadeHoursSettings>) => set({ hours: { ...h(), ...patch } });

  /** Ce que dit le bloc « Réveil depuis la veille » : lu dans Windows, rien n'y est écrit. */
  function wakeRows(): SectionRow[] {
    const v = h();
    const devices = host.wakeDevices();
    const allowed =
      devices === undefined
        ? t('Recherche des périphériques autorisés…')
        : devices === null
          ? t('Liste des périphériques indisponible')
          : devices.length
            ? t('Périphériques autorisés par Windows : {devices}', { devices: devices.join(', ') })
            : t('Aucun périphérique autorisé détecté');
    return [
      ...(v.stopBy === 'shutdown' ? [{ text: t('Après extinction, rallumez la borne avec le bouton d’alimentation du PC. Les autorisations ci-dessous concernent uniquement la veille.') }] : []),
      { text: t('Bouton d’alimentation du PC') },
      { text: allowed, tone: devices === null ? ('warning' as const) : undefined },
      { text: t('Informations lues dans Windows ; aucun réglage modifié ici.'), tone: 'quiet' as const },
    ];
  }

  function hoursActions(): Action[] {
    const v = h();
    const outside = !stopInNight(v);
    const rows: Record<HoursRow, Action> = {
      on: {
        label: v.on ? t('Horaire de la borne : activé') : t('Horaire de la borne : désactivé'),
        detail: v.on ? t('Règle l’attente la nuit et l’arrêt automatique (Start : désactiver)') : t('Réglages conservés ; aucun effet tant que l’horaire est désactivé (Start : activer)'),
        icon: 'auto',
        run: () => setHours({ on: !v.on }),
      },
      nightFrom: { label: t('Début de la nuit : {hour}', { hour: hourLabel(v.nightFrom) }), icon: 'attract', run: () => openHour('nightFrom') },
      nightTo: { label: t('Fin de la nuit : {hour}', { hour: hourLabel(v.nightTo) }), icon: 'sun', run: () => openHour('nightTo') },
      nightDim: {
        label: t('Écrans pendant l’attente nocturne : {dim}', { dim: nightDimLabel(v.nightDim) }),
        detail: t('L’attente est muette la nuit, quel que soit ce choix'),
        icon: 'bulb',
        run: () => openNightDim(),
      },
      stopAt: {
        label: v.stopAt === null ? t('Arrêt automatique : jamais') : t('Arrêt automatique : {hour}', { hour: hourLabel(v.stopAt) }),
        detail:
          v.stopAt === null
            ? undefined
            : outside
              ? t('Hors de la nuit ({from}–{to}) : arrêt à cette heure si la borne est libre, sinon dans l’heure qui suit', { from: hourLabel(v.nightFrom), to: hourLabel(v.nightTo) })
              : t('30 s de préavis ; si une partie est en cours, arrêt reporté jusqu’à ce que la borne soit libre, avant {hour}', { hour: hourLabel(v.nightTo) }),
        tone: outside ? 'warning' : undefined,
        icon: 'clock',
        run: () => openHour('stopAt'),
      },
      stopBy: {
        label: t('Mode d’arrêt : {action}', { action: stopActionLabel(v.stopBy) }),
        detail:
          v.stopBy === 'sleep' && !host.sleepAllowed()
            ? t('Ce PC n’a que la veille moderne : la borne ne pourra pas se mettre en veille (Start : extinction)')
            : v.stopAt === null
              ? t('Utilisé si une heure d’arrêt est choisie (Start : changer)')
              : v.stopBy === 'sleep'
                ? t('Le menu revient au réveil (Start : extinction)')
                : t('Cyber Pinball se ferme, puis Windows éteint le PC (Start : mise en veille)'),
        tone: v.stopBy === 'sleep' && !host.sleepAllowed() ? 'warning' : undefined,
        icon: v.stopBy === 'sleep' ? 'moon' : 'power',
        run: () => setHours({ stopBy: v.stopBy === 'sleep' ? 'shutdown' : 'sleep' }),
      },
    };
    return HOURS_ROWS.map((key) => rows[key]);
  }

  function openHours(at = 0): void {
    host.library.openCustom(
      () => ({
        heading: t('Horaire de la borne'),
        icon: 'clock',
        lead: t('La nuit, l’attente devient muette et les écrans peuvent s’assombrir. Un arrêt automatique laisse 30 s pour garder la borne allumée.'),
        sections: [{ title: t('Réveil depuis la veille'), rows: wakeRows() }],
        actions: [...hoursActions(), { label: t('Retour'), icon: 'back', run: () => open(row('hours')) }],
        back: () => open(row('hours')),
      }),
      at,
    );
  }

  function hourTitles(key: HourKey): { heading: string; icon: IconName; lead: string } {
    switch (key) {
      case 'nightFrom':
        return { heading: t('Début de la nuit'), icon: 'attract', lead: t('À partir de cette heure, la borne en attente baisse ses écrans et se tait.') };
      case 'nightTo':
        return { heading: t('Fin de la nuit'), icon: 'sun', lead: t('À cette heure, les écrans retrouvent leur lumière ; un arrêt retenu par une partie n’est plus fait.') };
      case 'stopAt':
        return {
          heading: t('Arrêt automatique'),
          icon: 'clock',
          lead: t('Heure à laquelle la borne s’arrête, si personne ne joue. Une partie en cours la retient : elle s’arrête dès que la borne est libre, jusqu’à la fin de la nuit.'),
        };
    }
  }

  function openHour(key: HourKey): void {
    const back = HOURS_ROWS.indexOf(key);
    const values: (number | null)[] = key === 'stopAt' ? [null, ...HOUR_CHOICES] : [...HOUR_CHOICES];
    const now = h()[key];
    const at = now === null ? 0 : values.indexOf(nearestChoice(HOUR_CHOICES, now));
    host.library.openCustom(
      () => ({
        ...hourTitles(key),
        sections: [],
        actions: [
          ...values.map((value) => {
            const v = h();
            const current = value === v[key];
            // Début et fin de la nuit égaux : pas de nuit du tout. Refusé, plutôt qu'une nuit de 24 h inventée.
            const clash = (key === 'nightFrom' && value === v.nightTo) || (key === 'nightTo' && value === v.nightFrom);
            const outside = key === 'stopAt' && value !== null && !stopInNight({ ...v, stopAt: value });
            return {
              label: value === null ? t('Jamais') : hourLabel(value),
              detail: current
                ? t('choix actuel')
                : clash
                  ? key === 'nightFrom'
                    ? t('Heure de la fin de la nuit : choisissez deux heures différentes')
                    : t('Heure du début de la nuit : choisissez deux heures différentes')
                  : outside
                    ? t('hors de la nuit')
                    : undefined,
              tone: current ? ('ok' as const) : clash ? ('quiet' as const) : undefined,
              run: () => {
                if (clash) return;
                setHours({ [key]: value });
                openHours(back);
              },
            };
          }),
          { label: t('Retour'), run: () => openHours(back) },
        ],
        back: () => openHours(back),
      }),
      Math.max(0, at),
    );
  }

  function openNightDim(): void {
    const back = HOURS_ROWS.indexOf('nightDim');
    host.library.openCustom(
      () => ({
        heading: t('Écrans pendant l’attente nocturne'),
        icon: 'bulb',
        lead: t('Voile noir posé sur chaque écran la nuit, quand la borne est en attente. Il descend lentement et se lève au premier bouton. Écrans noirs : les vidéos s’arrêtent dessous.'),
        sections: [],
        actions: [
          ...NIGHT_DIM_CHOICES.map((value) => ({
            label: capitalized(nightDimLabel(value)),
            detail: value === h().nightDim ? t('choix actuel') : undefined,
            tone: value === h().nightDim ? ('ok' as const) : undefined,
            run: () => {
              setHours({ nightDim: value });
              openHours(back);
            },
          })),
          { label: t('Retour'), run: () => openHours(back) },
        ],
        back: () => openHours(back),
      }),
      Math.max(0, NIGHT_DIM_CHOICES.indexOf(nearestChoice(NIGHT_DIM_CHOICES, h().nightDim))),
    );
  }

  return {
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
