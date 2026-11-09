// Réglages des médias, du son et du mode attente du menu,
// dans le menu système : musique des jeux, volumes, lancement en cinéma, mode attente et
// horaire de la borne (nuit voilée, arrêt à heure fixe : packages/core/src/arcadehours.ts),
// médias pendant la partie, DMD du menu (vivant ou classique) et sa couleur, qualité téléchargée depuis VPinMediaDB.
// Tout se règle aux boutons : Start change un choix ou ouvre la liste des valeurs, Exit revient.
// Les réglages s'appliquent tout de suite (on entend le nouveau volume) et sont gardés
// dans <données>\medias.json.

import {
  ATTRACT_DELAY_CHOICES,
  ATTRACT_INTERVAL_CHOICES,
  DMD_COLOR_PRESETS,
  DMD_TABLE_COLOR,
  HOUR_CHOICES,
  NIGHT_DIM_CHOICES,
  NOTICES_MODES,
  GAME_MEDIA_LABELS,
  MENU_DMD_LABELS,
  MENU_LAYOUT_LABELS,
  MENU_LAYOUTS,
  MEDIADB_4K_ABOVE,
  MEDIADB_QUALITY_LABELS,
  MEDIADB_QUALITY_SETTINGS,
  START_TABLE_LABELS,
  START_TABLES,
  WHEEL_START_LABELS,
  TABLE_ORDER_LABELS,
  TABLE_ORDERS,
  VOLUME_CHOICES,
  arcadeHoursSummary,
  attractDelayLabel,
  dmdColorLabel,
  dmdColorPreset,
  dmdColorReadable,
  durationLabel,
  hourLabel,
  formatNumber,
  nearestChoice,
  nextGameMediaMode,
  nightDimLabel,
  parseDmdColor,
  stopActionLabel,
  stopInNight,
  t,
  volumeLabel,
  type ArcadeHoursSettings,
  type IconName,
  type MenuLayout,
  type MenuMediaSettings,
  type StartTable,
  type TableOrder,
  type UiSoundId,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row as SectionRow } from './library';

export interface MenuSettingsHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    /** Saisie au clavier à l'écran (couleur libre du DMD) ; undefined : abandonnée. */
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
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
  /** Ouverture au démarrage (intro-menu.ts) : son écran, et ce qu'en dit la ligne. */
  intro: { open(back: () => void): void; summary(): string };
}

const heading = () => t('Médias, son et attente');
// La présentation du menu (une des quatre roues, ou la liste) est rangée ici aussi : c'est un réglage du menu, gardé dans medias.json.

const ORDER_DETAILS: Record<TableOrder, string> = {
  get title() {
    return t('De A à Z, comme les noms des tables');
  },
  get recent() {
    return t('La dernière table lancée en tête, les tables jamais jouées à la fin');
  },
  get played() {
    return t('Les tables lancées le plus souvent en tête, les tables jamais jouées à la fin');
  },
  get year() {
    return t('Des plus anciennes aux plus récentes ; année inconnue à la fin');
  },
  get manufacturer() {
    return t('Regroupées par fabricant (Bally, Stern, Williams…), puis par année');
  },
  get shuffle() {
    return t('Un ordre tiré au hasard à chaque démarrage de la borne, gardé jusqu’au suivant');
  },
};

const START_DETAILS: Record<StartTable, string> = {
  get first() {
    return t('La première table dans l’ordre choisi');
  },
  get random() {
    return t('Une table tirée au hasard : la borne ne s’ouvre pas toujours sur la même');
  },
  get last() {
    return t('La dernière table lancée, pour reprendre où l’on s’était arrêté');
  },
};

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
  'tableOrder',
  'startTable',
  'wheelStart',
  'tableColor',
  'music',
  'musicVolume',
  'videoVolume',
  'launchVolume',
  'cinema',
  'intro',
  'uiSounds',
  'uiSoundsVolume',
  'notices',
  'attractDelay',
  'attractInterval',
  'attractSound',
  'hours',
  'game',
  'dmd',
  'dmdColor',
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
      tableOrder: {
        label: t('Ordre des tables : {order}', { order: TABLE_ORDER_LABELS[v.tableOrder] }),
        detail: t('{detail} (Start : choisir)', { detail: ORDER_DETAILS[v.tableOrder] }),
        icon: 'sort',
        run: () => openTableOrder(),
      },
      startTable: {
        label: t('Table au démarrage : {start}', { start: START_TABLE_LABELS[v.startTable] }),
        detail: t('{detail} (Start : changer)', { detail: START_DETAILS[v.startTable] }),
        icon: 'pin',
        run: () => set({ startTable: START_TABLES[(START_TABLES.indexOf(v.startTable) + 1) % START_TABLES.length]! }),
      },
      wheelStart: {
        label: t('Start sur la roue : {start}', { start: WHEEL_START_LABELS[v.wheelStart] }),
        detail:
          v.wheelStart === 'play'
            ? t('Start lance la table choisie ; sa fiche s’ouvre à Start maintenu, ou F6 d’un clavier (Start : ouvrir plutôt la fiche)')
            : t('Start ouvre la fiche de la table (Jouer, Prospectus…), un second Start la lance (Start : jouer directement)'),
        icon: 'start',
        run: () => set({ wheelStart: v.wheelStart === 'play' ? 'sheet' : 'play' }),
      },
      tableColor: {
        label: v.tableColor ? t('Couleur de chaque table au menu : affichée') : t('Couleur de chaque table au menu : coupée'),
        detail: v.tableColor
          ? t('La lumière du bandeau de la roue, le halo des cadres et le fond des replis prennent la couleur du fronton de la table ; la table choisie reste en vert (Start : couper)')
          : t('Le menu garde la sarcelle de Cyber Pinball pour toutes les tables (Start : la couleur de chaque table)'),
        icon: 'bulb',
        run: () => set({ tableColor: !v.tableColor }),
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
      intro: {
        label: t('Ouverture au démarrage : {summary}', { summary: host.intro.summary() }),
        detail: t('Une animation sur chaque écran, gardée sur sa dernière image jusqu’au premier bouton ; vos images, vidéos et musique de fond (Start : régler)'),
        icon: 'play',
        run: () => host.intro.open(() => open(row('intro'))),
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
      notices: {
        label: v.notices === 'all' ? t('Notifications du menu : affichées') : v.notices === 'count' ? t('Notifications du menu : compteur seul') : t('Notifications du menu : coupées'),
        detail:
          v.notices === 'all'
            ? t('Nombre d’amis en ligne et un message discret, sur chaque écran, quand un ami se connecte, une demande arrive, un téléchargement finit ; pendant une partie, seulement une invitation, un ami qui se connecte et la partie entre amis (Start : compteur seul)')
            : v.notices === 'count'
              ? t('Le nombre d’amis en ligne ; seulement les nouvelles d’une partie entre amis (Start : rien)')
              : t('Ni compteur ni message, sauf les nouvelles d’une partie entre amis ; la pastille des téléchargements reste (Start : tout afficher)'),
        icon: 'bell',
        run: () => set({ notices: NOTICES_MODES[(NOTICES_MODES.indexOf(v.notices) + 1) % NOTICES_MODES.length]! }),
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
            ? t('Cyber Pinball dessine l’afficheur en continu : titre, records, PRESS START, horloge, crédits (Start : média seul)')
            : t('Le média DMD du jeu, sinon son titre qui défile (Start : DMD vivant)'),
        icon: 'dmd',
        run: () => set({ dmd: v.dmd === 'live' ? 'classic' : 'live' }),
      },
      dmdColor: {
        label: t('Couleur du DMD : {color}', { color: dmdColorLabel(v.dmdColor) }),
        detail: t('Les points de l’afficheur que Cyber Pinball dessine : DMD du menu, DMD d’un jeu sans média ; pas celui de VPX en partie (Start : choisir)'),
        icon: 'palette',
        run: () => openDmdColor(),
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

  function openTableOrder(): void {
    const back = row('tableOrder');
    host.library.openCustom(
      () => ({
        heading: t('Ordre des tables'),
        icon: 'sort',
        lead: t('Comment les médaillons se suivent dans la roue, et les titres dans la liste. La table choisie reste la même quand l’ordre change.'),
        sections: [],
        actions: [
          ...TABLE_ORDERS.map((order) => ({
            label: capitalized(TABLE_ORDER_LABELS[order]),
            detail: order === s().tableOrder ? t('{detail} · choix actuel', { detail: ORDER_DETAILS[order] }) : ORDER_DETAILS[order],
            tone: order === s().tableOrder ? ('ok' as const) : undefined,
            run: () => {
              set({ tableOrder: order });
              open(back);
            },
          })),
          { label: t('Retour'), run: () => open(back) },
        ],
        back: () => open(back),
      }),
      Math.max(0, TABLE_ORDERS.indexOf(s().tableOrder)),
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

  // ---------- Couleur du DMD ----------

  /**
   * Préréglages, puis la couleur libre. Le DMD du menu montre la marque dans le menu système
   * (aucune table) : la couleur choisie s'y voit dès le retour sur la ligne.
   */
  function openDmdColor(at?: number): void {
    const back = row('dmdColor');
    const current = () => s().dmdColor;
    const table = () => current() === DMD_TABLE_COLOR;
    const free = () => !table() && !dmdColorPreset(current());
    host.library.openCustom(
      () => ({
        heading: t('Couleur du DMD'),
        icon: 'palette',
        lead: t('Couleur des points du DMD du menu et des DMD que Cyber Pinball dessine pour un jeu sans média. Le DMD de VPX, en partie, garde la couleur de la table.'),
        sections: [],
        actions: [
          ...DMD_COLOR_PRESETS.map((preset) => ({
            label: preset.label,
            detail: preset.hex === current() ? t('{detail} · choix actuel', { detail: preset.detail }) : preset.detail,
            tone: preset.hex === current() ? ('ok' as const) : undefined,
            run: () => {
              set({ dmdColor: preset.hex });
              open(back);
            },
          })),
          {
            label: t('Couleur de la table'),
            detail: table()
              ? t('Les points prennent la couleur du fronton de chaque table, plus vive que celle du menu ; vert signal pour une table sans couleur · choix actuel')
              : t('Les points prennent la couleur du fronton de chaque table, plus vive que celle du menu ; vert signal pour une table sans couleur'),
            tone: table() ? ('ok' as const) : undefined,
            run: () => {
              set({ dmdColor: DMD_TABLE_COLOR });
              open(back);
            },
          },
          {
            label: free() ? t('Couleur libre : {hex}', { hex: current().toUpperCase() }) : t('Couleur libre…'),
            detail: free() ? t('Choix actuel · Start : en écrire une autre') : t('Une couleur écrite en hexadécimal, comme #8BE23A'),
            tone: free() ? ('ok' as const) : undefined,
            icon: 'edit',
            run: () => openFreeDmdColor(),
          },
          { label: t('Retour'), icon: 'back', run: () => open(back) },
        ],
        back: () => open(back),
      }),
      at ?? (table() ? DMD_COLOR_PRESETS.length : free() ? DMD_COLOR_PRESETS.length + 1 : Math.max(0, DMD_COLOR_PRESETS.findIndex((p) => p.hex === current()))),
    );
  }

  /** Couleur libre, au clavier à l'écran ; une couleur trop sombre pour l'afficheur est refusée. */
  function openFreeDmdColor(error?: string): void {
    // Après les préréglages et « Couleur de la table ».
    const at = DMD_COLOR_PRESETS.length + 1;
    host.library.openPrompt(
      t('Couleur libre du DMD'),
      t('Couleur (hexadécimal)'),
      (s().dmdColor === DMD_TABLE_COLOR ? DMD_COLOR_PRESETS[0]!.hex : s().dmdColor).toUpperCase(),
      (value) => {
        if (value === undefined) return openDmdColor(at);
        const color = parseDmdColor(value);
        if (!color) return openFreeDmdColor(t('« {value} » n’est pas une couleur : six chiffres hexadécimaux (0 à 9, A à F), comme #8BE23A.', { value }));
        if (!dmdColorReadable(color)) return openFreeDmdColor(t('{hex} est trop sombre : les points ne se verraient pas sur le noir de l’afficheur.', { hex: color.toUpperCase() }));
        set({ dmdColor: color });
        open(row('dmdColor'));
      },
      error ?? t('Six chiffres hexadécimaux, rouge puis vert puis bleu : #8BE23A est le vert signal, #FF8A1F l’orange plasma.'),
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
