// Pré-réglages de qualité de VPX (Menu système > Ma borne > VPX > Pré-réglages, 22/11/2026) : des modes prêts à
// l'emploi pour les réglages graphiques de VPX, et un mode Auto qui en choisit un d'après la machine, puis l'ajuste
// d'après ce que la carte graphique a vraiment fait pendant les parties.
//
// Pourquoi : laissés à leur valeur par défaut, les réglages de VPX 10.8.1 n'ont aucun anticrénelage (suréchantillonnage
// à 100 %, MSAA, FXAA et netteté désactivés) ; personne ne savait quoi choisir dans Réglages de VPX > Essentiels.
//
// Le mode Auto lit le bilan du temps de rendu de la carte graphique que notre VPX écrit au journal (correctif 04 de
// packages/vpx-corrige : « GPU frame end: … p95=…ms budget=…ms ») : la part du temps disponible par image (à la
// fréquence du playfield) que la carte graphique a prise. Le choix de départ suit des critères généraux (mémoire
// vidéo, pixels à dessiner par seconde), jamais un nom de modèle, comme le profil VR (vr-profil.ts).

import { IniDocument } from './ini';
import type { VpxSetting } from './vpx';

/** Les modes, du plus léger au plus beau. */
export const QUALITY_LEVELS = ['performance', 'equilibre', 'qualite', 'ultra'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];
/** Le choix du joueur : Auto, un mode fixe, ou ses propres réglages (un réglage d'un mode changé à la main). */
export type QualityChoice = 'auto' | QualityLevel | 'custom';

const player = (key: string, value: string): VpxSetting => ({ section: 'Player', key, value });

/**
 * Les réglages de chaque mode ([Player] de VPX 10.8.1-5436, bornes de Settings_properties.inl).
 * FXAA : 1 FXAA rapide, 5 DLAA standard, 6 SMAA qualité. Sharpen : 1 CAS. PFReflection : 2 statiques, 3 statiques et
 * billes, 5 dynamiques. Ces clés, et seulement elles, sont gérées par les pré-réglages : un autre réglage de VPX reste
 * celui du joueur.
 */
export function qualitySettings(level: QualityLevel): VpxSetting[] {
  switch (level) {
    case 'performance':
      return [player('AAFactor', '1'), player('MSAASamples', '0'), player('FXAA', '1'), player('Sharpen', '0'), player('PFReflection', '2'), player('DisableAO', '1'), player('DynamicAO', '0'), player('ForceBloomOff', '1')];
    case 'equilibre':
      return [player('AAFactor', '1'), player('MSAASamples', '0'), player('FXAA', '2'), player('Sharpen', '1'), player('PFReflection', '3'), player('DisableAO', '0'), player('DynamicAO', '0'), player('ForceBloomOff', '0')];
    case 'qualite':
      return [player('AAFactor', '1'), player('MSAASamples', '0'), player('FXAA', '6'), player('Sharpen', '1'), player('PFReflection', '5'), player('DisableAO', '0'), player('DynamicAO', '1'), player('ForceBloomOff', '0')];
    case 'ultra':
      return [player('AAFactor', '1.5'), player('MSAASamples', '0'), player('FXAA', '6'), player('Sharpen', '1'), player('PFReflection', '5'), player('DisableAO', '0'), player('DynamicAO', '1'), player('ForceBloomOff', '0')];
  }
}

/** Les clés gérées par les pré-réglages (les mêmes dans tous les modes). */
export const QUALITY_KEYS: readonly string[] = qualitySettings('equilibre').map((s) => s.key);

/** Même valeur numérique finie, y compris après une réécriture de VPX (1 et 1.000000). */
export function qualityValuesEqual(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined || a.trim() === '' || b.trim() === '') return false;
  return a.trim() === b.trim() || (Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Number(a) === Number(b));
}

/**
 * L'INI de la borne sans les valeurs qu'un pré-réglage y a écrites (`written`) : base d'une partie dans le casque, qui
 * a son propre profil graphique (vr-profil.ts, écrit dans les clés vides). Une valeur choisie par le joueur reste.
 */
export function withoutQualityPreset(iniText: string, written: Readonly<Record<string, string>> | undefined): string {
  if (!written || !Object.keys(written).length) return iniText;
  const doc = IniDocument.parse(iniText);
  let removed = false;
  for (const key of QUALITY_KEYS) {
    const value = doc.get('Player', key)?.trim();
    if (value !== undefined && written[key] !== undefined && qualityValuesEqual(value, written[key])) removed = doc.remove('Player', key) || removed;
  }
  return removed ? doc.toString() : iniText;
}

/** Valeurs lues dans un INI comparées à un mode : égales si toutes ses clés y sont à sa valeur (nombres comparés en nombres). */
export function matchesQuality(read: (key: string) => string | undefined, level: QualityLevel): boolean {
  return qualitySettings(level).every((s) => {
    const v = read(s.key)?.trim();
    return qualityValuesEqual(v, s.value);
  });
}

/** Le mode auquel correspondent les réglages lus, ou undefined (réglages du joueur, ou défauts de VPX). */
export function currentQuality(read: (key: string) => string | undefined): QualityLevel | undefined {
  return QUALITY_LEVELS.find((level) => matchesQuality(read, level));
}

export interface QualityMachine {
  /** Mémoire vidéo dédiée de la plus grosse carte graphique, en Mo (undefined : inconnue). */
  vramMb?: number;
  /** Playfield : définition et fréquence. */
  width?: number;
  height?: number;
  hz?: number;
}

/** Pixels à dessiner par seconde sur le playfield, en millions (1080p à 60 Hz : 124). */
export function pixelRate(m: QualityMachine): number | undefined {
  return m.width && m.height && m.hz ? (m.width * m.height * m.hz) / 1e6 : undefined;
}

/**
 * Le mode de départ du mode Auto, d'après la mémoire vidéo et les pixels à dessiner par seconde. Une carte inconnue,
 * ou un playfield inconnu, prend « Équilibré » au plus, et le mode Auto ajuste ensuite d'après les parties.
 */
export function initialQuality(m: QualityMachine): { level: QualityLevel; why: string } {
  const vram = m.vramMb;
  const rate = pixelRate(m);
  const what = [vram ? `${Math.round(vram / 1024)} Go de mémoire vidéo` : 'mémoire vidéo inconnue', rate ? `${Math.round(rate)} Mpx/s à dessiner` : 'playfield inconnu'].join(', '); // i18n-ignore : journal
  // La mémoire ne donne pas la vitesse de la carte : départ au plus Équilibré, puis les mesures autorisent la montée.
  // Classe de la carte (0 : moins de 3 Go, ou inconnue), moins la charge du playfield (4K à 120 Hz : 995 Mpx/s ;
  // 4K à 60 Hz : 497 ; 1080p à 60 Hz : 124). Playfield inconnu : compté moyen, et pas au-dessus d'Équilibré.
  const tier = !vram ? 0 : vram >= 10 * 1024 ? 3 : vram >= 6 * 1024 ? 2 : vram >= 3 * 1024 ? 1 : 0;
  const heavy = rate === undefined ? 1 : rate > 600 ? 2 : rate > 250 ? 1 : 0;
  const index = Math.max(0, Math.min(1, tier - heavy));
  return { level: QUALITY_LEVELS[index]!, why: what };
}

/** Bilan du temps de rendu de la carte graphique écrit par notre VPX (correctif 04). */
export interface GpuFrameStats {
  frames: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  /** Temps disponible par image à la fréquence du playfield. */
  budgetMs: number;
}

const GPU_LINE = /GPU frame (running|end): frames=(\d+) mean=([\d.]+)ms p50=([\d.]+)ms p95=([\d.]+)ms max=([\d.]+)ms budget=([\d.]+)ms/;

/** Le bilan de la partie (ligne « end »), ou à défaut la dernière minute relevée ; undefined sans notre VPX. */
export function readGpuFrames(lines: readonly string[]): GpuFrameStats | undefined {
  let last: GpuFrameStats | undefined;
  for (const line of lines) {
    const m = GPU_LINE.exec(line);
    if (!m) continue;
    const stats = { frames: Number(m[2]), meanMs: Number(m[3]), p50Ms: Number(m[4]), p95Ms: Number(m[5]), maxMs: Number(m[6]), budgetMs: Number(m[7]) };
    if (Object.values(stats).some((v) => !Number.isFinite(v) || v < 0) || stats.frames === 0 || stats.p95Ms === 0 || stats.budgetMs === 0) continue;
    last = stats;
  }
  return last;
}

/** Part du temps disponible prise par la carte graphique (95e centile) : 1 = juste à la limite. */
export function gpuLoad(s: GpuFrameStats): number | undefined {
  return s.budgetMs > 0 && s.frames > 0 ? s.p95Ms / s.budgetMs : undefined;
}

/** Une partie vue par le mode Auto. */
export interface QualityGame {
  at: string;
  level: QualityLevel;
  load: number;
  frames: number;
}

/** Ce que le mode Auto retient (données de Cyber Pinball, qualite-vpx.json). */
export interface QualityState {
  choice: QualityChoice;
  /** Mode Auto : le mode en cours. */
  level?: QualityLevel;
  /** Mode Auto : plus haut mode tenu sur cette machine (après un essai raté), jusqu'à un changement de machine. */
  ceiling?: QualityLevel;
  /** Mode Auto : le mode en cours vient d'être monté, à l'essai jusqu'à la partie suivante. */
  trial?: boolean;
  /** La machine pour laquelle le mode en cours a été choisi (carte graphique et playfield). */
  machine?: string;
  /** Les dernières parties lues (les plus récentes à la fin). */
  games?: QualityGame[];
  /** Valeurs écrites par Cyber Pinball dans le VPinballX.ini, pour reconnaître un changement à la main. */
  written?: Record<string, string>;
  /** Réglages personnels conservés avant un pré-réglage ; null représente une clé absente. */
  customSettings?: Record<string, string | null>;
}

/** La signature de la machine : un changement de carte graphique ou de playfield remet le mode Auto à son départ. */
export function machineKey(m: QualityMachine & { gpu?: string }): string {
  return [m.gpu ?? '?', m.vramMb ?? '?', m.width ?? '?', m.height ?? '?', m.hz ? Math.round(m.hz) : '?'].join('|');
}

/** Seuils du mode Auto (part du temps disponible par image prise par la carte graphique, au 95e centile). */
export const QUALITY_AUTO = {
  /** Au-dessus : la carte graphique ne tient plus la fréquence du playfield, un mode plus léger. */
  over: 0.9,
  /** Bien au-dessus, en une seule partie : on descend sans attendre. */
  farOver: 1.2,
  /** En dessous, sur les dernières parties : de la marge pour un mode plus beau. */
  under: 0.5,
  /** Parties nécessaires pour monter. */
  gamesToRaise: 3,
  /** Une partie plus courte (en images) ne compte pas : chargement, partie abandonnée. */
  minFrames: 3000,
  /** Parties gardées. */
  keep: 10,
} as const;

const step = (level: QualityLevel, by: number): QualityLevel => QUALITY_LEVELS[Math.max(0, Math.min(QUALITY_LEVELS.length - 1, QUALITY_LEVELS.indexOf(level) + by))]!;
const rank = (level: QualityLevel) => QUALITY_LEVELS.indexOf(level);

/**
 * Le mode Auto après une partie : la partie notée, puis un mode plus léger si la carte graphique peinait (deux des
 * trois dernières parties au-dessus de `over`, ou une seule bien au-dessus), un mode plus beau si les dernières
 * parties gardaient de la marge, jamais au-dessus du plafond trouvé. Un mode monté est à l'essai : s'il peine dès sa
 * première partie, il redescend et le mode d'en dessous devient le plafond. Rend le nouvel état et la raison du changement (undefined : pas de changement).
 */
export function adaptQuality(state: QualityState, stats: GpuFrameStats | undefined, now = new Date(), canRaise = true): { state: QualityState; change?: { from: QualityLevel; to: QualityLevel; why: string } } {
  if (state.choice !== 'auto' || !state.level || !stats) return { state };
  const load = gpuLoad(stats);
  if (load === undefined || stats.frames < QUALITY_AUTO.minFrames) return { state };
  const games = [...(state.games ?? []), { at: now.toISOString(), level: state.level, load: Math.round(load * 100) / 100, frames: stats.frames }].slice(-QUALITY_AUTO.keep);
  // Seules les parties consécutives au niveau actuel comptent : une ancienne série ne justifie pas une remontée.
  let first = games.length - 1;
  while (first > 0 && games[first - 1]!.level === state.level) first--;
  const same = games.slice(first);
  const { trial, ...rest } = state;
  const next: QualityState = { ...rest, games };
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const lastThree = same.slice(-3);
  // Un mode monté qui peine dès sa première partie ne tient pas sur cette machine : retour, et il devient le plafond.
  const failedTrial = Boolean(trial) && load > QUALITY_AUTO.over;
  const struggling = failedTrial || load > QUALITY_AUTO.farOver || lastThree.filter((g) => g.load > QUALITY_AUTO.over).length >= 2;
  if (struggling && rank(state.level) > 0) {
    const to = step(state.level, -1);
    return {
      state: { ...next, level: to, ...(failedTrial && { ceiling: to }) },
      change: { from: state.level, to, why: `carte graphique à ${pct(load)} du temps disponible par image` }, // i18n-ignore : journal
    };
  }
  const ceiling = state.ceiling ?? 'ultra';
  const roomy = same.length >= QUALITY_AUTO.gamesToRaise && same.slice(-QUALITY_AUTO.gamesToRaise).every((g) => g.load < QUALITY_AUTO.under);
  if (canRaise && roomy && rank(state.level) < rank(ceiling)) {
    const to = step(state.level, 1);
    return { state: { ...next, level: to, trial: true }, change: { from: state.level, to, why: `marge sur les ${QUALITY_AUTO.gamesToRaise} dernières parties (au plus ${pct(Math.max(...same.slice(-QUALITY_AUTO.gamesToRaise).map((g) => g.load)))})` } }; // i18n-ignore : journal
  }
  return { state: next };
}
