// Menu système > Tables > Roue : tous les réglages de la roue des tables au même endroit
// (demande du 12/11/2026 : « réunir dans un même menu toutes les options de la roue »).
// Présentation (une des quatre roues, ou la liste), ordre des tables, table au démarrage, ce que
// fait Start, logos animés (la table choisie seule, ou tous), couleur de chaque table, médaillon
// Juke-box. Ils étaient dans « Médias, son et attente », qui garde le son, l'attente et le DMD.
// Tout se règle aux boutons : Start change un choix ou ouvre la liste des valeurs, Exit revient.
// Les réglages s'appliquent tout de suite et sont gardés dans <données>\medias.json.

import {
  MENU_LAYOUT_LABELS,
  MENU_LAYOUTS,
  START_TABLE_LABELS,
  START_TABLES,
  TABLE_ORDER_LABELS,
  TABLE_ORDERS,
  WHEEL_MOTION_LABELS,
  WHEEL_START_LABELS,
  t,
  type MenuLayout,
  type MenuMediaSettings,
  type StartTable,
  type TableOrder,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem } from './library';

export interface WheelSettingsHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  settings(): MenuMediaSettings;
  /** Enregistre et applique (état renvoyé aux fenêtres). */
  save(next: MenuMediaSettings): void;
}

const heading = () => t('Roue');

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

/**
 * Lignes de l'écran, dans l'ordre : un sous-écran revient sur sa ligne par son rang, tiré
 * d'ici (une ligne ajoutée ne décale pas les retours).
 */
export const WHEEL_SETTINGS_ROWS = ['menuLayout', 'tableOrder', 'startTable', 'wheelStart', 'wheelMotion', 'tableColor', 'jukebox', 'community', 'collectionsMedallion'] as const;
type Row = (typeof WHEEL_SETTINGS_ROWS)[number];
const row = (key: Row) => WHEEL_SETTINGS_ROWS.indexOf(key);

export function createWheelSettings(host: WheelSettingsHost): ProvidedSystemItem {
  const s = () => host.settings();
  const set = (patch: Partial<MenuMediaSettings>) => host.save({ ...s(), ...patch });

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
      // Logos animés (APNG, GIF, WebP) : les voisins figés sur leur première image, ou tous animés.
      wheelMotion: {
        label: t('Logos animés : {motion}', { motion: WHEEL_MOTION_LABELS[v.wheelMotion] }),
        detail:
          v.wheelMotion === 'selected'
            ? t('Seul le logo de la table choisie s’anime ; les autres restent fixes, sur leur première image (Start : animer tous les logos)')
            : t('Chaque logo animé de la roue joue son animation, même loin du centre (Start : seulement la table choisie)'),
        icon: 'sparkle',
        run: () => set({ wheelMotion: v.wheelMotion === 'selected' ? 'all' : 'selected' }),
      },
      tableColor: {
        label: v.tableColor ? t('Couleur de chaque table au menu : affichée') : t('Couleur de chaque table au menu : coupée'),
        detail: v.tableColor
          ? t('La lumière du bandeau de la roue, le halo des cadres et le fond des replis prennent la couleur du fronton de la table ; la table choisie reste en vert (Start : couper)')
          : t('Le menu garde la sarcelle de Cyber Pinball pour toutes les tables (Start : la couleur de chaque table)'),
        icon: 'bulb',
        run: () => set({ tableColor: !v.tableColor }),
      },
      jukebox: {
        label: v.jukebox ? t('Juke-box dans la roue : affiché') : t('Juke-box dans la roue : masqué'),
        detail: v.jukebox
          ? t('Le médaillon Juke-box ouvre chaque collection de la roue, avant les tables (Start : le masquer)')
          : t('La roue ne montre que les tables ; vos playlists restent dans la gestion du Juke-box (Start : afficher le médaillon)'),
        icon: 'jukebox',
        run: () => set({ jukebox: !v.jukebox }),
      },
      community: {
        label: v.community ? t('Communauté dans la roue : affichée') : t('Communauté dans la roue : masquée'),
        detail: v.community
          ? t('Le médaillon Communauté suit le Juke-box en tête de chaque collection : joueurs en ligne, messages, classements (Start : le masquer)')
          : t('La communauté reste dans Menu système › Amis (Start : afficher le médaillon)'),
        icon: 'friends',
        run: () => set({ community: !v.community }),
      },
      collectionsMedallion: {
        label: v.collectionsMedallion ? t('Collections dans la roue : affichées') : t('Collections dans la roue : masquées'),
        detail: v.collectionsMedallion
          ? t('Le médaillon Collections suit la Communauté en tête de chaque collection : Start ouvre la liste des collections (Start : le masquer)')
          : t('Les MagnaSave et Menu système › Collections changent toujours de collection (Start : afficher le médaillon)'),
        icon: 'star',
        run: () => set({ collectionsMedallion: !v.collectionsMedallion }),
      },
    };
    return WHEEL_SETTINGS_ROWS.map((key) => rows[key]);
  }

  function build(): Built {
    return {
      heading: heading(),
      icon: 'wheel',
      lead: t('Comment la roue présente les tables. Chaque choix s’applique aussitôt ; les collections qu’elle montre se règlent dans « Collections ».'),
      sections: [],
      actions: [...actions(), { label: t('Retour'), icon: 'back', run: () => host.library.openSystem() }],
      back: () => host.library.openSystem(),
    };
  }

  function open(at = 0): void {
    host.library.openCustom(build, at);
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

  return {
    get detail() {
      const v = s();
      return t('{layout} · ordre : {order} · logos animés : {motion}', {
        layout: capitalized(MENU_LAYOUT_LABELS[v.menuLayout]),
        order: TABLE_ORDER_LABELS[v.tableOrder],
        motion: WHEEL_MOTION_LABELS[v.wheelMotion],
      });
    },
    run: () => open(),
  };
}
