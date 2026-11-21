// Lunettes 3D (anaglyphe) : la table en relief avec de simples lunettes à filtres colorés (rouge /
// cyan, vert / magenta, ambre / bleu). VPX 10.8 sait le faire ([Player] Stereo3D, Renderer.cpp) :
// il rend le plateau pour chaque œil, avec une projection décentrée (ViewSetup::ComputeMVP), puis
// mêle les deux images selon le profil des lunettes (Anaglyph.cpp).
//
// Cumul avec la Vision 3D : le plugin Vision3D déplace le point de vue (viewX/Y/Z) ; VPX calcule
// l'image de chaque œil à partir de ce point de vue, décalé d'une demi-distance entre les yeux. En
// mode borne (Window), le plan sans relief est la distance réelle de la tête à l'écran : il suit la
// tête lui aussi. Rien à faire dans le plugin (lu dans ViewSetup.cpp de VPX 10.8.1-5436).
//
// Où vont les réglages : VPX lit le mode stéréo dans les réglages de la table (player.cpp,
// m_ptable->m_settings), qui priment sur ceux de la borne. Chaque partie reçoit donc une copie du
// fichier propre à la table (vide s'il n'en a pas), complétée des réglages ci-dessous et passée par
// -TableIni : ni VPinballX.ini de la borne, ni le fichier de la table ne sont modifiés, et désactiver
// ne laisse aucune trace. Le profil employé est « Anaglyph Custom 1 » (Stereo3D = 11, clés
// Anaglyph7…) : jamais un des profils que VPX propose, qu'un joueur aurait pu régler lui-même.
//
// Ce module ne lit ni n'écrit rien : réglage, INI de la partie, calibrage et textes du menu.
// app/src/anaglyph.ts et app/src/anaglyph-menu.ts font le reste.

import { t } from './i18n';
import { IniDocument } from './ini';
import type { VpxSetting } from './vpx';
import { VR_REFUSED_FXAA, VR_STEREO_FXAA } from './vr';

export type AnaglyphMode = 'off' | 'on';
export type AnaglyphGlasses = 'red-cyan' | 'green-magenta' | 'amber-blue';
/** Couleurs : désaturation de ce qu'un seul œil verrait (fatigue), de la plus calme à la plus vive. */
export type AnaglyphColors = 'comfort' | 'balanced' | 'vivid';
export type FilterRgb = readonly [number, number, number];

/**
 * Ce que chaque œil perçoit, à travers son filtre, du rouge, du vert et du bleu de l'écran (0 à 1) :
 * les mesures du calibrage de VPX (Anaglyph{N}LeftRed…, StereoSettingsPage.cpp). Elles disent aussi
 * à VPX quelles lunettes sont portées et de quel côté (Anaglyph::Update, couleurs déduites).
 */
export interface AnaglyphCalibration {
  left: FilterRgb;
  right: FilterRgb;
}

export interface AnaglyphSetting {
  mode: AnaglyphMode;
  glasses: AnaglyphGlasses;
  /** Profondeur : la distance réelle entre les yeux (63 mm) multipliée par elle. 1 : physiquement juste en borne. */
  depth: number;
  colors: AnaglyphColors;
  /** Mesuré avec ces lunettes sur cet écran ; absent : valeurs d'usine de VPX pour ces lunettes. */
  calibration?: AnaglyphCalibration;
}

/** « Anaglyph Custom 1 » : le premier profil libre de VPX (typedefs3D.h, STEREO_ANAGLYPH_1 = 5). */
export const ANAGLYPH_STEREO_MODE = 11;
/** Son numéro dans les clés de VPinballX.ini (Anaglyph7LeftRed…) : 11 - 5 + 1. */
export const ANAGLYPH_PROFILE = 7;
/** Distance moyenne entre les yeux d'un adulte, celle de VPX par défaut (Stereo3DEyeSeparation). */
export const EYE_SEPARATION_MM = 63;
/** Filtre « Luminance » (Anaglyph{N}Filter = 2) : celui que VPX met par défaut à ses profils. */
const LUMINANCE_FILTER = '2';

export const ANAGLYPH_GLASSES: readonly AnaglyphGlasses[] = ['red-cyan', 'green-magenta', 'amber-blue'];
export const ANAGLYPH_DEPTHS = [0.5, 0.75, 1, 1.25, 1.5] as const;
export const ANAGLYPH_COLORS: readonly AnaglyphColors[] = ['comfort', 'balanced', 'vivid'];
/** Désaturation dynamique de VPX (Anaglyph{N}DynDesat) de chaque choix de couleurs. */
const DYN_DESAT: Record<AnaglyphColors, number> = { comfort: 1, balanced: 0.5, vivid: 0 };

/**
 * Valeurs d'usine de VPX 10.8.1 pour chaque paire, verre gauche d'abord (Settings_properties.inl) :
 * rouge / cyan = profil 1, vert / magenta = profil 2, ambre / bleu = profil 6.
 */
export const GLASSES_PRESETS: Readonly<Record<AnaglyphGlasses, AnaglyphCalibration>> = {
  'red-cyan': { left: [0.95, 0.19, 0.07], right: [0.06, 0.92, 0.28] },
  'green-magenta': { left: [0.06, 0.96, 0.09], right: [0.61, 0.16, 0.66] },
  'amber-blue': { left: [0.61, 0.66, 0.09], right: [0.05, 0.16, 0.96] },
};

export const DEFAULT_ANAGLYPH: AnaglyphSetting = { mode: 'off', glasses: 'red-cyan', depth: 1, colors: 'comfort' };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Une mesure gardée entre 1 % et 100 % : VPX en tire un logarithme, zéro le casserait. */
const level = (v: number) => Math.min(1, Math.max(0.01, v));

function parseRgb(raw: unknown): FilterRgb | undefined {
  if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(finite)) return undefined;
  const [r, g, b] = raw as [number, number, number];
  return [level(r), level(g), level(b)];
}

/** Réglage lu sans faire confiance au fichier : toute valeur douteuse reprend sa valeur par défaut. */
export function parseAnaglyphSetting(raw: unknown): AnaglyphSetting {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const glasses = ANAGLYPH_GLASSES.includes(r.glasses as AnaglyphGlasses) ? (r.glasses as AnaglyphGlasses) : DEFAULT_ANAGLYPH.glasses;
  const cal = (r.calibration && typeof r.calibration === 'object' ? r.calibration : {}) as Record<string, unknown>;
  const left = parseRgb(cal.left);
  const right = parseRgb(cal.right);
  return {
    mode: r.mode === 'on' ? 'on' : 'off',
    glasses,
    depth: finite(r.depth) && r.depth >= 0.25 && r.depth <= 2 ? r.depth : DEFAULT_ANAGLYPH.depth,
    colors: ANAGLYPH_COLORS.includes(r.colors as AnaglyphColors) ? (r.colors as AnaglyphColors) : DEFAULT_ANAGLYPH.colors,
    ...(left && right ? { calibration: { left, right } } : {}),
  };
}

/** Les mesures en vigueur : le calibrage, sinon les valeurs d'usine des lunettes choisies. */
export function anaglyphFilters(s: AnaglyphSetting): AnaglyphCalibration {
  return s.calibration ?? GLASSES_PRESETS[s.glasses];
}

export function nextGlasses(g: AnaglyphGlasses): AnaglyphGlasses {
  return ANAGLYPH_GLASSES[(ANAGLYPH_GLASSES.indexOf(g) + 1) % ANAGLYPH_GLASSES.length]!;
}

export function nextDepth(d: number): number {
  const i = ANAGLYPH_DEPTHS.findIndex((v) => v > d + 1e-6);
  return i < 0 ? ANAGLYPH_DEPTHS[0] : ANAGLYPH_DEPTHS[i]!;
}

export function nextColors(c: AnaglyphColors): AnaglyphColors {
  return ANAGLYPH_COLORS[(ANAGLYPH_COLORS.indexOf(c) + 1) % ANAGLYPH_COLORS.length]!;
}

export function glassesLabel(g: AnaglyphGlasses): string {
  return g === 'green-magenta' ? t('vert / magenta') : g === 'amber-blue' ? t('ambre / bleu') : t('rouge / cyan');
}

export function depthLabel(d: number): string {
  return `${Math.round(d * 100)} %`;
}

export function colorsLabel(c: AnaglyphColors): string {
  return c === 'vivid' ? t('vives') : c === 'balanced' ? t('équilibrées') : t('confortables');
}

/** Nombre écrit pour VPX : point décimal, sans zéros inutiles. */
const num = (v: number) => String(Math.round(v * 1000) / 1000);

/** Clés que Cyber Pinball pose pour la partie en relief : jamais reportées dans le fichier de la table. */
export function isAnaglyphKey(section: string, key: string): boolean {
  if (section.toLowerCase() !== 'player') return false;
  const k = key.toLowerCase();
  return k.startsWith('stereo3d') || k.startsWith(`anaglyph${ANAGLYPH_PROFILE}`) || k === 'fxaa';
}

/**
 * Réglages de la partie en relief, à poser dans la copie du fichier de la table. `table` : son
 * fichier propre (texte, vide s'il n'en a pas) ; `global` : le VPinballX.ini de la partie. L'anticrénelage
 * SMAA, que VPX n'applique pas en stéréo (Renderer.cpp, ApplyPostProcessedAntialiasing), devient FXAA
 * qualité, comme pour le casque (vr.ts).
 */
export function anaglyphGameSettings(s: AnaglyphSetting, table: string, global: string): VpxSetting[] {
  const f = anaglyphFilters(s);
  const p = `Anaglyph${ANAGLYPH_PROFILE}`;
  const player = (key: string, value: string): VpxSetting => ({ section: 'Player', key, value });
  const fxaa = IniDocument.parse(table).get('Player', 'FXAA')?.trim() || IniDocument.parse(global).get('Player', 'FXAA')?.trim();
  return [
    player('Stereo3D', String(ANAGLYPH_STEREO_MODE)),
    player('Stereo3DEnabled', '1'),
    player('Stereo3DEyeSeparation', num(EYE_SEPARATION_MM * s.depth)),
    player(`${p}Filter`, LUMINANCE_FILTER),
    player(`${p}DynDesat`, num(DYN_DESAT[s.colors])),
    player(`${p}sRGB`, '1'),
    player(`${p}LeftRed`, num(f.left[0])),
    player(`${p}LeftGreen`, num(f.left[1])),
    player(`${p}LeftBlue`, num(f.left[2])),
    player(`${p}RightRed`, num(f.right[0])),
    player(`${p}RightGreen`, num(f.right[1])),
    player(`${p}RightBlue`, num(f.right[2])),
    ...(fxaa === VR_REFUSED_FXAA ? [player('FXAA', VR_STEREO_FXAA)] : []),
  ];
}

// --- Calibrage --------------------------------------------------------------------------------
//
// Le calibrage de VPX (StereoSettingsPage::UpdateAnaglyphCalibrationModal), refait dans le front-end
// pour qu'il se fasse aux boutons de la borne, avant de jouer : six étapes, chaque œil et chaque
// couleur (rouge, vert, bleu). Deux carrés côte à côte : à gauche un visage de la couleur pure sur un
// fond gris, à droite un visage gris sur un fond de la couleur pure. L'œil d'en face fermé, le joueur
// règle le gris jusqu'à ce qu'aucun des deux visages ne ressorte plus que l'autre : ce gris est ce
// que l'œil perçoit de la couleur à travers son filtre (Kindlmann et al., « Face-based luminance
// matching », IEEE Visualization 2002). Le gris est écrit tel quel (sRGB), comme ImGui le fait.

export const ANAGLYPH_CALIBRATION_STEPS = 6;
export type CalibrationEye = 'left' | 'right';

export function calibrationStepOf(step: number): { eye: CalibrationEye; channel: 0 | 1 | 2 } {
  const s = Math.min(ANAGLYPH_CALIBRATION_STEPS - 1, Math.max(0, Math.trunc(step)));
  return { eye: s < 3 ? 'left' : 'right', channel: (s % 3) as 0 | 1 | 2 };
}

/** Valeur mesurée à cette étape. */
export function calibrationLevel(cal: AnaglyphCalibration, step: number): number {
  const { eye, channel } = calibrationStepOf(step);
  return cal[eye][channel];
}

/** Le gris de cette étape changé de `delta` (gardé entre 1 % et 100 %). */
export function adjustCalibration(cal: AnaglyphCalibration, step: number, delta: number): AnaglyphCalibration {
  const { eye, channel } = calibrationStepOf(step);
  const v = [...cal[eye]] as [number, number, number];
  v[channel] = Math.round(level(v[channel] + delta) * 1000) / 1000;
  return { ...cal, [eye]: v as FilterRgb };
}

/** Pas d'un appui, puis plus grand quand le bouton reste tenu (répétition). */
export function calibrationDelta(repeat: boolean, direction: 1 | -1): number {
  return direction * (repeat ? 0.02 : 0.01);
}

/** Ce que montre l'écran du calibrage à une étape. */
export interface AnaglyphCalibrationView {
  step: number;
  steps: number;
  eye: CalibrationEye;
  /** Couleur pure de l'étape (#ff0000, #00ff00 ou #0000ff). */
  color: string;
  /** Le gris réglé, en #rrggbb. */
  gray: string;
  /** Le gris en pour cent, pour le dire. */
  percent: number;
  /** Polygones du visage, dans un carré de 160 × 320 (points SVG). */
  face: readonly string[];
}

const hex2 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');

export function anaglyphCalibrationView(cal: AnaglyphCalibration, step: number): AnaglyphCalibrationView {
  const { eye, channel } = calibrationStepOf(step);
  const v = calibrationLevel(cal, step);
  const g = hex2(v);
  return {
    step: Math.min(ANAGLYPH_CALIBRATION_STEPS - 1, Math.max(0, Math.trunc(step))),
    steps: ANAGLYPH_CALIBRATION_STEPS,
    eye,
    color: ['#ff0000', '#00ff00', '#0000ff'][channel]!,
    gray: `#${g}${g}${g}`,
    percent: Math.round(v * 100),
    face: ANAGLYPH_FACE,
  };
}

/**
 * Le visage du calibrage de VPX (StereoSettingsPage.cpp, VPX 10.8.1, GPLv3 comme Cyber Pinball) :
 * 13 polygones convexes, chacun donné par son premier point puis des déplacements relatifs, dans un
 * repère de 320 unités centré sur (140, 140). Ramenés ici dans un carré de 160 × 320, visage centré.
 */
const FACE_LENGTHS = [9, 4, 7, 5, 5, 4, 4, 5, 4, 4, 4, 5, 4];
const FACE_STEPS: readonly (readonly [number, number])[] = [
  [96.5, 86.9], [17.6, -48.1], [7.5, -1.3], [13.1, -0.8], [19.8, 0.3], [22.5, 1.6], [-14.2, 51.9], [-25.7, 14.2], [-16.8, 1.1],
  [176.9, 38.5], [37.7, 25.7], [-7.8, 33.7], [-44.1, -7.5],
  [120.3, 105.6], [-14.7, 39.8], [-1.3, 13.6], [16.6, 1.3], [24.6, -35.0], [0.8, -15.5], [-9.1, -5.3],
  [120.8, 160.4], [20.8, 11.5], [68.7, -10.4], [-19.2, -27.3], [-45.7, -8.8],
  [116.8, 171.1], [-3.2, 16.0], [-24.9, -0.5], [-2.3, -12.5], [9.7, -6.0],
  [116.8, 171.1], [24.9, 0.8], [12.8, 22.2], [-40.9, -6.9],
  [141.6, 171.9], [68.7, -10.4], [-20.3, 40.6], [-35.5, -8.0],
  [154.5, 194.0], [-3.5, 8.8], [3.7, 30.2], [25.1, -10.2], [10.2, -20.8],
  [151.0, 202.9], [-23.3, -2.4], [2.9, 43.0], [24.0, -10.4],
  [89.0, 194.8], [38.8, 5.6], [2.9, 43.0], [-38.0, -5.3],
  [191.1, 134.2], [5.3, -19.0], [17.1, -1.1], [-3.2, 47.3],
  [74.6, 151.9], [7.9, -23.8], [26.5, -3.0], [-12.9, 42.9], [-9.7, 6.0],
  [65.5, 148.9], [6.8, -38.6], [10.6, -0.8], [-0.4, 18.5],
];

/**
 * VPX place chaque visage en (milieu de son carré, milieu de l'écran) + (p - 140) × 2t / 320, t étant
 * la largeur d'un carré : avec t = 160, le point p tombe en (p.x - 60, p.y + 20) dans le carré.
 */
export const ANAGLYPH_FACE: readonly string[] = (() => {
  const polygons: string[] = [];
  let at = 0;
  for (const n of FACE_LENGTHS) {
    let x = 0;
    let y = 0;
    const points: string[] = [];
    for (let j = 0; j < n; j++) {
      x += FACE_STEPS[at + j]![0];
      y += FACE_STEPS[at + j]![1];
      points.push(`${num(x - 60)},${num(y + 20)}`);
    }
    polygons.push(points.join(' '));
    at += n;
  }
  return polygons;
})();

// --- Textes du menu ---------------------------------------------------------------------------

/** Ligne du Menu système (Ma borne > Réalité virtuelle et vision 3D > Lunettes 3D). */
export function anaglyphMenuText(s: AnaglyphSetting): { label: string; detail: string } {
  return s.mode === 'on'
    ? { label: t('Lunettes 3D : activées'), detail: t('Lunettes {glasses} · profondeur {depth}{calibrated}', { glasses: glassesLabel(s.glasses), depth: depthLabel(s.depth), calibrated: s.calibration ? t(' · calibrées') : '' }) }
    : { label: t('Lunettes 3D : désactivées'), detail: t('La table en relief avec des lunettes à filtres colorés (rouge / cyan…), seules ou avec la Vision 3D') };
}
