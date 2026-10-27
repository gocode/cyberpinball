// Couleur des points de l'afficheur que Cyber Pinball dessine lui-même : DMD vivant du menu
// (livedmd.ts), afficheurs de repli d'un jeu sans média DMD (app/renderer/fallback.js, dmd et
// fullDmd). Une seule couleur pour tous, réglée dans « Médias, son et attente » et gardée
// dans medias.json (mediaview.ts, MenuMediaSettings.dmdColor).
//
// Par défaut, celle de la direction artistique (docs/design-system, jeton `dmd`) ; quelques
// préréglages, dont l'orange des afficheurs à plasma d'origine ; ou une couleur libre, écrite
// en hexadécimal au clavier à l'écran. Le DMD d'une partie reste celui de VPX : ce réglage
// n'y touche pas.

import { t } from './i18n';

export interface DmdColorPreset {
  id: string;
  hex: string;
  readonly label: string;
  readonly detail: string;
}

/**
 * Préréglages, la couleur de la DA d'abord ; tous tirés des teintes du design system, sauf l'orange
 * des afficheurs à plasma, gardé pour les puristes (revue du directeur artistique, 27/10/2026).
 */
export const DMD_COLOR_PRESETS: readonly DmdColorPreset[] = [
  {
    id: 'signal',
    hex: '#8be23a',
    get label() {
      return t('Vert signal');
    },
    get detail() {
      return t('Couleur de la marque : celle de PINBALL et du choix courant');
    },
  },
  {
    id: 'sarcelle',
    hex: '#36c9b4',
    get label() {
      return t('Sarcelle');
    },
    get detail() {
      return t('La lumière des filets et du verre fumé de l’interface');
    },
  },
  {
    id: 'encre',
    hex: '#e6f0ec',
    get label() {
      return t('Encre claire');
    },
    get detail() {
      return t('Le blanc légèrement sarcelle du texte de l’interface');
    },
  },
  {
    id: 'glacier',
    hex: '#5fb4cf',
    get label() {
      return t('Bleu glacier');
    },
    get detail() {
      return t('Le bleu des fabricants et des années');
    },
  },
  {
    id: 'ambre',
    hex: '#f2b33d',
    get label() {
      return t('Ambre doux');
    },
    get detail() {
      return t('Plus chaud et plus doux que l’orange');
    },
  },
  {
    id: 'plasma',
    hex: '#ff8a1f',
    get label() {
      return t('Orange plasma');
    },
    get detail() {
      return t('Les afficheurs à plasma des flippers des années 1990');
    },
  },
];

/** Couleur par défaut : le vert signal de la DA. */
export const DEFAULT_DMD_COLOR = DMD_COLOR_PRESETS[0]!.hex;

/** « #8BE23A », « 8be23a », « #8be » → « #8be23a » ; undefined si ce n'est pas une couleur hexadécimale. */
export function parseDmdColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const m = /^\s*#?([0-9a-f]{3}|[0-9a-f]{6})\s*$/i.exec(value);
  if (!m) return undefined;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return `#${h.toLowerCase()}`;
}

/**
 * Plus forte composante (0 à 255) qu'une couleur de DMD doit atteindre : en dessous, même le
 * plein éclat se perd dans le noir de l'afficheur, et les nuances basses ne se voient plus.
 */
export const DMD_COLOR_MIN_PEAK = 112;

/** Une couleur lisible sur l'afficheur : assez lumineuse pour que ses 16 nuances se distinguent. */
export function dmdColorReadable(hex: string): boolean {
  const c = parseDmdColor(hex);
  if (!c) return false;
  return Math.max(...[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))) >= DMD_COLOR_MIN_PEAK;
}

/** Couleur lue de medias.json : une couleur lisible, sinon celle par défaut. */
export function normalizeDmdColor(value: unknown): string {
  const c = parseDmdColor(value);
  return c && dmdColorReadable(c) ? c : DEFAULT_DMD_COLOR;
}

/** Préréglage de cette couleur, s'il y en a un. */
export function dmdColorPreset(hex: string): DmdColorPreset | undefined {
  const c = parseDmdColor(hex);
  return DMD_COLOR_PRESETS.find((p) => p.hex === c);
}

/** Nom montré : celui du préréglage, sinon « couleur libre #A1B2C3 ». */
export function dmdColorLabel(hex: string): string {
  const preset = dmdColorPreset(hex);
  return preset ? preset.label : t('couleur libre {hex}', { hex: (parseDmdColor(hex) ?? hex).toUpperCase() });
}
