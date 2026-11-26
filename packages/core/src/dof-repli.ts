// Repli DOF des tables à ROM : la config du configtool n'a souvent presque rien pour les bandes de LED
// adressables (Medieval Madness 2 effets, Addams Family 6, Indiana Jones 4), et pendant une partie
// VPX c'est libdof qui tient le port des bandes : notre pilote ne peut rien y ajouter. Le repli est
// donc ÉCRIT dans la config DOF : un directoutputconfig99.ini (marqué « Written by Cyber Pinball »)
// avec des effets génériques tirés des signaux de la ROM, lu par libdof à côté des autres ini grâce
// au LedWizEquivalent 99 du Cabinet.xml, qui vise les mêmes bandes.
//
// libdof ne garde, pour une ROM, que les lignes du meilleur rang de correspondance, tous ini confondus
// (LedControlConfigList::GetTableConfigDictionary) : égalité, puis « <clé>_ », puis début de nom. La
// ligne de repli reprend donc la clé que libdof choisit déjà, sinon elle masquerait la vraie config.
// Une config riche (Monster Bash) n'a pas de ligne : on n'y ajoute rien.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import type { DofSetup } from './dof';
import { hasDofSleep, restoreDofSleep } from './dof-remplacement';
import type { DofEventClass, DofEventKind } from './dof-evenements-script';

/** Numéro de l'ini et du LedWizEquivalent du repli (libre dans le configtool : 1–94, 120+). */
export const DOF_FALLBACK_NUMBER = 99;
/** Première ligne de l'ini de repli : Cyber Pinball le réécrit ou l'efface, jamais un fichier sans elle. */
export const DOF_FALLBACK_MARK = '# Written by Cyber Pinball';

/** Ini déjà parsé, à la manière de libdof (variables développées, lignes de [Config DOF]). */
export interface DofIniConfig {
  number: number;
  colors: Set<string>;
  lines: { key: string; columns: string[] }[];
}

/** Sorties d'un LedWizEquivalent du Cabinet.xml. */
export interface DofEquivalentOutputs {
  number: number;
  outputs: { number: number; name: string }[];
}

export interface DofFallbackStrip {
  name: string;
  width: number;
  height: number;
}

/** Sépare hors parenthèses (TableConfigColumnList / TableConfigColumn de libdof). */
function splitOutside(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseDofIni(text: string, number: number): DofIniConfig {
  const sections = new Map<string, string[]>();
  let current = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']') && line.length > 2) {
      current = line.slice(1, -1).trim().toLowerCase();
      continue;
    }
    if (!sections.has(current)) sections.set(current, []);
    sections.get(current)!.push(line);
  }
  const colors = new Set<string>();
  for (const l of [...(sections.get('colors dof') ?? []), ...(sections.get('colors ledwiz') ?? [])]) {
    const name = l.split('=')[0]!.trim().toLowerCase();
    if (name) colors.add(name);
  }
  const vars = new Map<string, string>();
  for (const l of sections.get('variables dof') ?? []) {
    const i = l.indexOf('=');
    if (i > 0) vars.set(l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim());
  }
  const expand = (s: string) => {
    let out = s;
    for (let pass = 0; pass < 5 && out.includes('@'); pass++) out = out.replace(/@([^@\s,/]+)@/g, (m, v: string) => vars.get(v.toLowerCase()) ?? m);
    return out;
  };
  const lines: DofIniConfig['lines'] = [];
  for (const l of [...(sections.get('config dof') ?? []), ...(sections.get('config outs') ?? [])]) {
    const parts = splitOutside(expand(l), ',');
    const key = parts[0]!.trim();
    if (!key) continue;
    const columns = parts.slice(1).map((c) => c.trim());
    while (columns.length && !columns.at(-1)) columns.pop();
    lines.push({ key, columns });
  }
  return { number, colors, lines };
}

const isOff = (s: string) => /^(0|off)$/i.test(s.trim());

function settingHasColor(setting: string, colors: Set<string>): boolean {
  return setting
    .trim()
    .split(/\s+/)
    .slice(1)
    .some((tok) => /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(tok) || colors.has(tok.toLowerCase()));
}

/** Réglages non éteints d'une colonne. */
function settingsOf(column: string): string[] {
  return splitOutside(column, '/')
    .map((s) => s.trim())
    .filter((s) => s && !isOff(s));
}

/** Rang de correspondance libdof d'une clé pour une ROM (1 à 3), ou 0. */
function matchTier(key: string, rom: string): number {
  if (key.toUpperCase() === rom.toUpperCase()) return 1;
  if (rom.toUpperCase().startsWith(`${key.toUpperCase()}_`)) return 2;
  if (rom.startsWith(key)) return 3;
  return 0;
}

/** Lignes que libdof retient pour une ROM : une par ini, au meilleur rang trouvé dans l'ensemble. */
export function dofRomLines(configs: DofIniConfig[], rom: string): { tier: number; lines: { number: number; key: string; columns: string[] }[] } {
  for (const tier of [1, 2, 3]) {
    const lines = configs.flatMap((c) => {
      const line = c.lines.find((l) => matchTier(l.key, rom) === tier);
      return line ? [{ number: c.number, key: line.key, columns: line.columns }] : [];
    });
    if (lines.length) return { tier, lines };
  }
  return { tier: 0, lines: [] };
}

/** Effets qu'une ligne envoie sur chaque sortie de départ (premier numéro de colonne, à la manière de libdof). */
function columnOutputs(columns: string[], colors: Set<string>): { output: number; settings: string[] }[] {
  const out: { output: number; settings: string[] }[] = [];
  let n = 1;
  for (const column of columns) {
    const settings = settingsOf(column);
    out.push({ output: n, settings });
    n += settings.some((s) => settingHasColor(s, colors)) ? 3 : 1;
  }
  return out;
}

/** Déclencheurs d'un réglage (S12, W15, L3, E101, G1), conditions entre parenthèses comprises. */
function settingTriggers(setting: string): string[] {
  const first = setting.split(/\s+/)[0]!;
  const tokens = first.startsWith('(') ? (setting.match(/\(([^)]*)\)/)?.[1] ?? '').split(/[^A-Za-z0-9]+/) : first.split('|');
  const found: string[] = [];
  for (const t of tokens) {
    const m = /^([LSWGE])(\d+)$/i.exec(t.trim());
    if (m) found.push(`${m[1]!.toUpperCase()}${Number(m[2])}`);
  }
  return found;
}

/**
 * Un réglage qui réagit au jeu : déclenché par une lampe, une bobine, un contact ou un événement. Un
 * éclairage permanent (ON, une couleur seule) ou qui suit seulement l'éclairage général (G1) n'anime rien :
 * essai sur une borne, 25/11/2026, Addams Family « LED allumées en continu, sans réagir aux événements ».
 */
function isReactive(setting: string): boolean {
  return settingTriggers(setting).some((t) => t[0] !== 'G');
}

/**
 * Effets que libdof enverra aux bandes de LED pour cette ROM et qui réagissent au jeu : un par signal
 * et par bande (deux réglages du même signal sur la même bande, comme les deux moitiés d'un même éclair,
 * n'en font qu'un). Les éclairages permanents ne comptent pas.
 */
export function dofRomStripEffects(configs: DofIniConfig[], equivalents: DofEquivalentOutputs[], stripNames: string[], rom: string): number {
  const seen = new Set<string>();
  for (const { strip, setting } of stripSettings(configs, equivalents, stripNames, rom)) if (isReactive(setting)) seen.add(`${strip}|${settingTriggers(setting).sort().join('+')}`);
  return seen.size;
}

/** Réglages que libdof enverra aux bandes de LED pour cette ROM. */
function stripSettings(configs: DofIniConfig[], equivalents: DofEquivalentOutputs[], stripNames: string[], rom: string): { strip: string; setting: string }[] {
  const strips = new Set(stripNames);
  const found: { strip: string; setting: string }[] = [];
  for (const line of dofRomLines(configs, rom).lines) {
    const config = configs.find((c) => c.number === line.number)!;
    const outputs = new Map<number, string>();
    for (const e of equivalents.filter((x) => x.number === line.number)) for (const o of e.outputs) outputs.set(o.number, o.name);
    for (const col of columnOutputs(line.columns, config.colors)) {
      const name = outputs.get(col.output);
      if (name && strips.has(name)) for (const setting of col.settings) found.push({ strip: name, setting });
    }
  }
  return found;
}

/** Appels DOF du script d'une table originale : numéro d'événement → nombre d'appels. */
export type DofScriptEvents = ReadonlyMap<number, number>;

/**
 * Part des appels DOF du script d'une table originale qu'au moins un effet des bandes de LED suit, en
 * dessous de laquelle la config est complétée. Mesuré le 26/11/2026 sur une borne à bandes seules : la
 * config du configtool vise surtout les jouets (bobines, contacteurs), et pour JP's Space Cadet une autre
 * version du script (événements 302 à 485, quand la table jouée envoie 101 à 153) : 9 % des appels suivis,
 * LED muettes ; The Matrix 26 %, City Hunter 36 % : effets « assez légers ».
 */
export const DOF_ORIGINAL_COVERED = 0.5;

/** Événements du script qu'un effet des bandes suit, et part des appels qu'ils représentent. */
export function dofOriginalCoverage(configs: DofIniConfig[], equivalents: DofEquivalentOutputs[], stripNames: string[], rom: string, events: DofScriptEvents): { covered: Set<number>; share: number } {
  const followed = new Set<number>();
  for (const { setting } of stripSettings(configs, equivalents, stripNames, rom)) for (const t of settingTriggers(setting)) if (t[0] === 'E') followed.add(Number(t.slice(1)));
  const covered = new Set([...events.keys()].filter((n) => followed.has(n)));
  let all = 0;
  let hit = 0;
  for (const [n, count] of events) {
    all += count;
    if (covered.has(n)) hit += count;
  }
  return { covered, share: all ? hit / all : 1 };
}

/** Déclencheurs (L lampes, S bobines, W contacts, E événements, G éclairage général) des lignes de la ROM. */
export function dofRomTriggers(configs: DofIniConfig[], rom: string): string[] {
  const found = new Set<string>();
  for (const line of dofRomLines(configs, rom).lines) {
    for (const column of line.columns) for (const setting of settingsOf(column)) for (const t of settingTriggers(setting)) found.add(t);
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// Effets génériques
// ---------------------------------------------------------------------------

function hashOf(text: string): number {
  let h = 2166136261;
  for (const ch of text.toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/** Quatre couleurs vives tirées du nom de la ROM, quand la table n'a pas de palette. */
export function romPalette(rom: string): string[] {
  const base = hashOf(rom) % 360;
  return [0, 150, 60, 230].map((d) => hslHex((base + d) % 360, 1, 0.5));
}

function dim(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * factor));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hexOf = (c: number[]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/**
 * Couleur d'un effet : pleine, sa composante la plus forte à 255, même teinte. Les bandes d'une borne tournent
 * souvent à 10–30 % de luminosité, avec une courbe qui écrase les tons bas : une couleur assombrie n'y est plus
 * visible. Essai du 26/11/2026, The Matrix : « pas vu l'animation des flips », jaune atténué à 45 % (#685100).
 * La légèreté d'un effet tient à sa taille et à sa durée, jamais à une couleur sombre.
 */
export function dofVivid(hex: string): string {
  const c = rgbOf(hex);
  const max = Math.max(...c);
  return max === 0 ? '#FFFFFF' : hexOf(c.map((v) => (v * 255) / max));
}

/** Le plancher de dofVivid : la composante la plus forte de toute couleur d'effet (l'éclairage général à part). */
export const DOF_COLOR_FLOOR = 255;

function hueOf(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/**
 * La teinte voisine d'un dégradé : la même couleur, décalée vers sa voisine plus chaude (jaune → orange,
 * vert → vert-jaune, bleu → bleu-cyan), aussi pleine. Un blanc ou un gris : un blanc chaud.
 */
export function dofGradientPartner(hex: string): string {
  const { h, s } = hueOf(dofVivid(hex));
  if (s < 0.15) return '#FFD8A0';
  return dofVivid(hslHex((h - 22 + 360) % 360, 1, 0.5));
}

/** Reflet : la couleur mêlée de blanc (pastel), pour les étincelles et le cœur des éclairs. */
function sheen(hex: string, k = 0.55): string {
  return hexOf(rgbOf(dofVivid(hex)).map((v) => v + (255 - v) * k));
}

/** Durée la plus longue d'un effet du repli, attente comprise (ms) : sans événement nouveau, les bandes s'éteignent après. */
export const DOF_EFFECT_MAX_MS = 600;
/** Part de la bande, depuis le bas, que la barre des flippers ne dépasse jamais : sa tête s'y éteint en fondu. */
export const DOF_FLIPPER_REACH = 0.5;

/**
 * Tracé de la barre des flippers, en % de la bande depuis la base : un segment plein, puis des points d'un
 * pour cent de plus en plus espacés jusqu'à DOF_FLIPPER_REACH. Le fondu vers les LED éteintes tient à la
 * densité des points, pas à leur luminosité (tramage) : en partie, Cyber Pinball baisse les bandes par le
 * <Brightness> de libdof (dof-niveau.ts), que libdof applique après sa courbe, en (b/100)^2,2 et en tronquant ;
 * à 11, il ne reste qu'un niveau par couleur, à 28 une quinzaine. Un dégradé de luminosité s'y arrête net
 * (essais des 0.2.4-essai.56 et 57 : « s'arrête brutalement », « je voudrais qu'elle se fonde ») ; un tramage
 * se voit à tout niveau.
 */
export function dofFlipperPattern(): { from: number; size: number }[] {
  const solid = 15;
  const out = [{ from: 0, size: solid }];
  for (let at = solid, gap = 2; at + gap + 1 <= DOF_FLIPPER_REACH * 100; gap++) {
    at += gap;
    out.push({ from: at, size: 1 });
    at += 1;
  }
  return out;
}

const FULL = 'AL0 AT0 AW100 AH100';
const WHITE = '#FFFFFF';

/** Une bande vue le long de sa longueur : du bas (verticale) ou de la gauche (horizontale), en pourcentage. */
interface Axis {
  /** Zone de from à from + size (0 : le bas de la bande verticale, la gauche d'une horizontale). */
  span: (from: number, size: number) => string;
  up: string;
  down: string;
}
const axisOf = (vertical: boolean): Axis =>
  vertical
    ? { span: (from, size) => `AL0 AW100 AT${100 - from - size} AH${size}`, up: 'U', down: 'D' }
    : { span: (from, size) => `AT0 AH100 AL${from} AW${size}`, up: 'R', down: 'L' };

/**
 * Un effet d'événement : plusieurs calques sur le même déclencheur, chacun borné (durée et attente W comprises,
 * DOF_EFFECT_MAX_MS au plus), qui partent quand l'événement s'allume et s'arrêtent seuls, même s'il reste allumé.
 * Jamais « BLINK » : libdof clignote alors tant que l'événement est allumé (essai du 26/11/2026, The Matrix
 * clignotait sans fin au repos). Toujours deux teintes au moins (couleur et sa voisine), pour la profondeur.
 *
 * Les briques que libdof sait rendre sur une bande adressable (Configurator.cpp) :
 * - comète : balayage AS/AD d'une durée courte et d'un fondu FD — libdof pousse chaque valeur du fondu dans le
 *   balayage, d'où une tête brillante et une traînée qui s'estompe ; une seconde comète de la teinte voisine,
 *   partie W ms plus tard sur un calque au-dessus, fait le dégradé de la traînée ;
 * - plasma : APC (seconde couleur), APS (vitesse), APD (densité) — deux teintes qui ondulent et se mêlent ;
 * - étincelles : AFDEN/AFMIN/AFMAX/AFFADE — des points qui s'allument au hasard et s'éteignent en fondu ;
 * - éclair : une zone qui s'allume et s'estompe (FD), blanc au cœur pour l'éclat.
 */
type Fx = (t: string, c: string, l: number, a: Axis, slot: number) => string[];

const comet = (t: string, c: string, l: number, dir: string, speed: number, hold: number, tail: number, wait = 0) => `${t} ${c} ${FULL} AS${speed} AD${dir} FD${tail}${wait ? ` W${wait}` : ''} ${hold} L${l}`;
const plasma = (t: string, c: string, area: string, l: number, ms: number, speed = 350, density = 90, wait = 0) =>
  `${t} ${c} ${area} APC${dofGradientPartner(c)} APS${speed} APD${density} FU60 FD220${wait ? ` W${wait}` : ''} ${ms} L${l}`;
const sparkles = (t: string, c: string, area: string, l: number, ms: number, wait = 0, density = 35) => `${t} ${c} ${area} AFDEN${density} AFMIN40 AFMAX140 AFFADE110${wait ? ` W${wait}` : ''} ${ms} L${l}`;
const flash = (t: string, c: string, area: string, l: number, ms: number, fade = 180, wait = 0) => `${t} ${c} ${area} FD${fade}${wait ? ` W${wait}` : ''} ${ms} L${l}`;

/**
 * Bille envoyée : une comète qui monte toute la bande, tête de la couleur de la table, traînée de sa teinte
 * voisine, éclair blanc au départ en bas, étincelles en haut quand elle arrive. Essai du 26/11/2026 : « pas
 * d'animation à l'envoi d'une bille ».
 */
const launchFx: Fx = (t, c, l, a) => [
  comet(t, c, l, a.up, 260, 160, 220),
  comet(t, dofGradientPartner(c), l + 1, a.up, 260, 110, 200, 70),
  sparkles(t, sheen(c), a.span(65, 35), l + 2, 260, 300),
  flash(t, WHITE, a.span(0, 18), l + 3, 90, 160),
];
/** Bille servie, partie lancée : une vague de plasma aux deux teintes sur toute la bande, éclat blanc bref. */
const waveFx: Fx = (t, c, l) => [plasma(t, c, FULL, l, 450, 420, 110), flash(t, sheen(c, 0.7), FULL, l + 1, 60, 200)];
/** Bille perdue : la comète redescend, de la teinte voisine vers la couleur de la table. */
const drainFx: Fx = (t, c, l, a) => [comet(t, dofGradientPartner(c), l, a.down, 220, 180, 260), comet(t, c, l + 1, a.down, 220, 110, 220, 90)];
/** Grands moments (jackpot, multibille, extra-bille, fin de partie) : éclair blanc, plasma, pluie d'étincelles. */
const bigFx: Fx = (t, c, l) => [flash(t, WHITE, FULL, l + 2, 80, 260), plasma(t, c, FULL, l, 520, 600, 130, 60), sparkles(t, sheen(c, 0.7), FULL, l + 1, 420, 150, 45)];
/**
 * Tilt : trois éclairs francs, aux deux teintes. « 420 3 » : trois clignotements en 420 ms (libdof divise la
 * durée par leur nombre : 140 ms par cycle, 70 allumé) ; « 70 3 » n'en faisait que trois de 12 ms.
 */
const tiltFx: Fx = (t, c, l) => [`${t} ${c} ${FULL} 420 3 L${l}`, `${t} ${dofGradientPartner(c)} ${FULL} W70 420 3 L${l + 1}`];
/** Les tiers de la bande, de bas en haut, pour varier la place des petits effets. */
const THIRDS = [0, 33, 66];
/** Choc (bumper, slingshot, éjecteur) : un éclair dans un tiers, dégradé de la teinte voisine au bord, cœur blanc. */
const hitFx: Fx = (t, c, l, a, slot) => {
  const from = THIRDS[slot % 3]!;
  return [flash(t, c, a.span(from, 34), l, 110, 200), flash(t, dofGradientPartner(c), a.span(from, 10), l + 1, 90, 180), flash(t, sheen(c, 0.75), a.span(from + 14, 6), l + 2, 50, 120)];
};
/** Cible, couloir, spinner, rampe : un plasma bref dans un tiers, quelques étincelles par-dessus. */
const sparkFx: Fx = (t, c, l, a, slot) => {
  const area = a.span(THIRDS[slot % 3]!, 34);
  return [plasma(t, c, area, l, 260, 500, 150), sparkles(t, sheen(c), area, l + 1, 220, 40)];
};
/** Rampe, orbite : une comète courte qui monte, sa teinte voisine en traînée. */
const rushFx: Fx = (t, c, l, a) => [comet(t, c, l, a.up, 380, 90, 180), comet(t, dofGradientPartner(c), l + 1, a.up, 380, 60, 160, 50)];

/** Effet de chaque rôle ; les autres (« other ») tournent sur ROTATION, pour la variété. */
const ROLE_FX: Partial<Record<DofEventKind, Fx>> = {
  launch: launchFx,
  'ball-start': waveFx,
  'game-start': bigFx,
  drain: drainFx,
  jackpot: bigFx,
  multiball: bigFx,
  award: bigFx,
  'game-over': drainFx,
  tilt: tiltFx,
  bumper: hitFx,
  sling: hitFx,
  kicker: hitFx,
  flasher: hitFx,
  target: sparkFx,
  rollover: sparkFx,
  spinner: sparkFx,
  ramp: rushFx,
};
/** Formes variées des événements sans rôle connu, et des signaux des ROM (bobines, contacts, événements). */
const ROTATION: Fx[] = [rushFx, hitFx, sparkFx, waveFx, drainFx, hitFx];
/** Lampes des ROM : courtes et partielles, elles clignotent souvent. */
const LAMP_ROTATION: Fx[] = [hitFx, sparkFx];
/** Calques réservés à chaque événement (la barre des flippers en superpose une dizaine). */
const LAYERS = 10;
/** Tir des flippers : vitesse (% de la bande par seconde) et durée de l'impulsion poussée dans le balayage (ms). */
export const DOF_FLIPPER_SHOT = { speed: 90, pulse: 60, wait: 60 };

/**
 * Flippers : très légers, ils sont actionnés sans cesse. Une barre aux couleurs de la table qui part du bas de la
 * bande (du bord, côté du flipper, sur une bande horizontale) : segment plein, base de la teinte voisine, puis
 * une tête tramée (dofFlipperPattern) qui se fond vers les LED éteintes avant DOF_FLIPPER_REACH. Les points
 * s'allument de la base vers la tête à quelques ms d'écart (le coup monte), la tête s'éteint la première. Couleurs
 * opaques : une transparence partielle s'éteint à faible luminosité.
 *
 * Et un petit tir : une impulsion brève poussée dans un balayage de toute la bande (AS/AD), qui se détache de la
 * barre et file lentement vers le fond du plateau (le haut de la bande, le bord opposé d'une horizontale).
 * libdof garde chaque impulsion dans le balayage : plusieurs coups d'affilée font plusieurs tirs à la suite.
 * Une fois par coup, même flipper tenu levé.
 */
function flipperBar(trigger: string, color: string, layer: number, vertical: boolean, side: 'left' | 'right' | 'center'): string[] {
  const fromRight = !vertical && side === 'right';
  const area = (from: number, size: number) =>
    vertical ? `AL0 AW100 AT${100 - from - size} AH${size}` : fromRight ? `AT0 AH100 AL${100 - from - size} AW${size}` : `AT0 AH100 AL${from} AW${size}`;
  const dir = vertical ? 'U' : fromRight ? 'L' : 'R';
  const [solid, ...dots] = dofFlipperPattern();
  const shot = DOF_FLIPPER_SHOT;
  return [
    `${trigger} ${color} ${area(solid!.from, solid!.size)} FU30 FD180 150 L${layer}`,
    `${trigger} ${dofGradientPartner(color)} ${area(0, Math.round(solid!.size / 3))} FD200 160 L${layer + 1}`,
    ...dots.map((d, k) => `${trigger} ${color} ${area(d.from, d.size)} FU30 FD${120 - k * 10} W${12 + k * 10} ${120 - k * 12} L${layer + 2 + k}`),
    `${trigger} ${color} ${FULL} AS${shot.speed} AD${dir} FU20 FD50 W${shot.wait} ${shot.pulse} L${layer + LAYERS - 1}`,
  ];
}

/**
 * Effet d'un événement d'une table originale selon son rôle. Un lanceur tenu (bille posée au lanceur, DOFOn à
 * son arrivée, DOFOff quand elle part) : la comète part à l'extinction (INVERT de libdof), au moment où la bille
 * est envoyée ; à l'arrivée, une lueur brève en bas, la bille prête.
 */
function roleEffect(t: string, cls: DofEventClass | undefined, color: string, layer: number, vertical: boolean, slot: number): string[] {
  const a = axisOf(vertical);
  const c = dofVivid(color);
  if (cls?.kind === 'flipper') return flipperBar(t, c, layer, vertical, cls.side);
  if (cls?.kind === 'launch' && cls.held) return [...launchFx(t, c, layer, a, slot).map((s) => s.replace(/ L(\d+)$/, ' INVERT L$1')), plasma(t, c, a.span(0, 25), layer + 4, 400, 250, 80)];
  const fx = (cls && ROLE_FX[cls.kind]) ?? ROTATION[slot % ROTATION.length]!;
  return fx(t, c, layer, a, slot);
}

/** Déclencheurs retenus, dans l'ordre des effets : bobines, contacts, lampes, événements ; GI à part. */
function pickTriggers(found: string[]): { hits: string[]; gi: string[] } {
  const of = (k: string, max: number) =>
    found
      .filter((t) => t[0] === k)
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
      .slice(0, max);
  let hits = [...of('S', 14), ...of('W', 8), ...of('L', 6), ...of('E', 6)];
  // Trop peu de signaux connus : les bobines de la ROM (flashers, bumpers, slingshots, éjecteurs).
  const coils = Array.from({ length: 28 }, (_, i) => `S${i + 1}`);
  if (hits.length < 4) hits = [...new Set([...hits, ...coils])];
  // Au moins 8 signaux qui réagissent par bande : une seule bande suffit alors à dépasser le seuil de pauvreté.
  else if (hits.length < 8) hits = [...new Set([...hits, ...coils])].slice(0, 8);
  const gi = of('G', 2);
  return { hits, gi: gi.length ? gi : ['G1'] };
}

/** Colonne d'une bande pour une ROM. */
function stripColumn(strip: DofFallbackStrip, index: number, triggers: { hits: string[]; gi: string[] }, palette: string[]): string {
  const vertical = strip.height > strip.width;
  const settings = triggers.gi.map((g, i) => `${g} ${dim(palette[(index + i) % palette.length]!, 0.18)} ${FULL} FU300 FD500 L${1 + i}`);
  const axis = axisOf(vertical);
  triggers.hits.forEach((t, i) => {
    const rotation = t[0] === 'L' ? LAMP_ROTATION : ROTATION;
    const fx = rotation[(i + index) % rotation.length]!;
    settings.push(...fx(t, dofVivid(palette[(i + index) % palette.length]!), 10 + LAYERS * i, axis, i + index));
  });
  return settings.join('/');
}

/** Part des événements (les plus appelés d'abord) aux couleurs de la table ; les autres, plus rares, plus variées. */
const COMMON_SHARE = 0.6;
/** Événements d'une table originale complétés au plus, par bande. */
const ORIGINAL_MAX = 24;

/**
 * Colonne d'une bande pour une table originale : un effet par événement du script qu'aucun effet ne suit,
 * aux couleurs de la table (principale, secondaire) pour les plus appelés, variées pour les rares. Pas
 * d'éclairage général : sans ROM, G1 ne s'allume jamais.
 */
function originalColumn(strip: DofFallbackStrip, index: number, events: string[], colors: string[], rom: string, classes?: ReadonlyMap<number, DofEventClass>): string {
  const vertical = strip.height > strip.width;
  const common = [colors[0]!, colors[2] ?? colors[0]!];
  const rare = [colors[1] ?? colors[0]!, ...romPalette(rom)];
  const commonCount = Math.ceil(events.length * COMMON_SHARE);
  return events
    .flatMap((t, i) => {
      const cls = classes?.get(Number(t.slice(1)));
      // Flippers et lanceur : la couleur principale de la table, toujours.
      const color = cls?.kind === 'flipper' || cls?.kind === 'launch' ? colors[0]! : i < commonCount ? common[(i + index) % common.length]! : rare[(i - commonCount + index) % rare.length]!;
      return roleEffect(t, cls, color, 10 + LAYERS * i, vertical, i + index);
    })
    .join('/');
}

/**
 * Événements d'une table originale qui ne sont pas des actions de jeu : éclairage général, moteurs et aimants.
 * Ils restent allumés longtemps (E118 de The Matrix, toute la partie) : rien sur les bandes, au repos elles
 * restent calmes. Ils ne comptent pas non plus dans la part des appels suivis.
 */
const QUIET_KINDS: ReadonlySet<DofEventKind> = new Set(['gi', 'mech']);
export function dofPlayEvents(events: DofScriptEvents, classes: ReadonlyMap<number, DofEventClass> | undefined): Map<number, number> {
  return new Map([...events].filter(([n]) => !QUIET_KINDS.has(classes?.get(n)?.kind ?? 'other')));
}

export interface DofFallbackInput {
  /** Ini lus par libdof, sans celui du repli. */
  configs: DofIniConfig[];
  /** LedWizEquivalent du Cabinet.xml (celui du repli compris). */
  equivalents: DofEquivalentOutputs[];
  strips: DofFallbackStrip[];
  /** ROM des tables de la bibliothèque. */
  roms: string[];
  /** Couleurs de la table d'une ROM (#RRGGBB), sinon tirées de son nom. */
  palette?: (rom: string) => string[] | undefined;
  /** Appels DOF du script, pour une table originale (sans ROM, ses événements relayés à libdof). */
  events?: (rom: string) => DofScriptEvents | undefined;
  /** Rôle des événements de ce script (classifyDofScript) : flippers, éclairage général… */
  classes?: (rom: string) => ReadonlyMap<number, DofEventClass> | undefined;
}

export interface DofFallbackPlan {
  /** Contenu de directoutputconfig99.ini ; undefined : rien à ajouter (le fichier est à retirer). */
  content?: string;
  added: { rom: string; key: string; before: number }[];
  /** ROM laissées telles quelles : leur config a déjà assez d'effets sur les bandes. */
  rich: string[];
}

/** En dessous : config pauvre, complétée par le repli. */
export function dofPoorBelow(strips: number): number {
  return Math.max(8, 4 * strips);
}

/** Bandes visées par le LedWizEquivalent du repli, dans l'ordre de leurs sorties. */
function fallbackOutputs(input: DofFallbackInput): { output: number; strip: DofFallbackStrip }[] {
  const eq = input.equivalents.find((e) => e.number === DOF_FALLBACK_NUMBER);
  if (!eq) return [];
  return eq.outputs
    .flatMap((o) => {
      const strip = input.strips.find((s) => s.name === o.name);
      return strip ? [{ output: o.number, strip }] : [];
    })
    .sort((a, b) => a.output - b.output);
}

export function planDofFallback(input: DofFallbackInput): DofFallbackPlan {
  const plan: DofFallbackPlan = { added: [], rich: [] };
  const outputs = fallbackOutputs(input);
  if (!outputs.length) return plan;
  const stripNames = input.strips.map((s) => s.name);
  const poorBelow = dofPoorBelow(input.strips.length);
  type Original = { events: string[]; share: number; total: number; classes?: ReadonlyMap<number, DofEventClass> };
  const keys = new Map<string, { rom: string; before: number; triggers: string[]; original?: Original }>();
  const roms = [...new Set(input.roms.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  for (const rom of roms) {
    const sent = input.events?.(rom);
    const classes = sent?.size ? input.classes?.(rom) : undefined;
    const events = sent?.size ? dofPlayEvents(sent, classes) : undefined;
    let original: Original | undefined;
    let before: number;
    if (sent?.size && !events?.size) {
      plan.rich.push(rom); // rien que de l'éclairage ou des moteurs : rien à ajouter
      continue;
    }
    if (events?.size) {
      // Table originale : jugée sur les événements que son script envoie vraiment, pas sur ceux que la config prévoit.
      const cov = dofOriginalCoverage(input.configs, input.equivalents, stripNames, rom, events);
      before = cov.covered.size;
      if (cov.share >= DOF_ORIGINAL_COVERED) {
        plan.rich.push(rom);
        continue;
      }
      const wanted = [...events].filter(([n]) => !cov.covered.has(n)).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      original = { events: wanted.slice(0, ORIGINAL_MAX).map(([n]) => `E${n}`), share: cov.share, total: events.size, ...(classes ? { classes } : {}) };
    } else {
      before = dofRomStripEffects(input.configs, input.equivalents, stripNames, rom);
      if (before >= poorBelow) {
        plan.rich.push(rom);
        continue;
      }
    }
    const { lines } = dofRomLines(input.configs, rom);
    // Même clé que la vraie config : le repli ne change pas le rang que libdof retient.
    const key = lines[0]?.key ?? rom;
    if (keys.has(key.toLowerCase())) continue;
    keys.set(key.toLowerCase(), { rom, before, triggers: dofRomTriggers(input.configs, rom), ...(original ? { original } : {}) });
    plan.added.push({ rom, key, before });
  }
  if (!plan.added.length) return plan;
  const configLines: string[] = [];
  const comments: string[] = [];
  for (const a of plan.added) {
    const info = keys.get(a.key.toLowerCase())!;
    const triggers = pickTriggers(info.triggers);
    const palette = (input.palette?.(a.rom) ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
    const colors = palette.length ? palette.map((c) => c.toUpperCase()) : romPalette(a.rom);
    const columns: string[] = [];
    let n = 1;
    outputs.forEach(({ output, strip }, index) => {
      if (output < n) return; // sorties qui se chevauchent : bande laissée de côté
      while (n < output) {
        columns.push('0');
        n++;
      }
      columns.push(info.original ? originalColumn(strip, index, info.original.events, colors, a.rom, info.original.classes) : stripColumn(strip, index, triggers, colors));
      n += 3;
    });
    configLines.push(`${a.key},${columns.join(',')}`);
    if (info.original) comments.push(`# ${a.rom}: ${a.before} of the ${info.original.total} DOF events of the table script followed on the LED strips (${Math.round(info.original.share * 100)} % of its calls), ${info.original.events.length} added per strip.`); // i18n-ignore : fichier lu par DOF
    else comments.push(`# ${a.rom}: ${a.before} LED strip effect(s) in the configuration, ${triggers.hits.length + triggers.gi.length} added per strip.`); // i18n-ignore : fichier lu par DOF
  }
  plan.content = [
    `${DOF_FALLBACK_MARK} (LED et retours (DOF)). Generic LED strip effects for ROMs whose DOF configuration has few or none.`, // i18n-ignore : fichier lu par DOF
    '# Cyber Pinball rewrites this file before each game; delete it (or turn the option off) to remove these effects.', // i18n-ignore : fichier lu par DOF
    ...comments,
    '[Colors DOF]',
    'White=#ffffffff',
    '[Config DOF]',
    ...configLines,
    '',
  ].join('\r\n');
  return plan;
}

/** Le fichier est-il celui du repli de Cyber Pinball (réécrit, effacé) ? */
export function isOwnedFallbackIni(text: string): boolean {
  return text.startsWith(DOF_FALLBACK_MARK);
}

/** Bloc LedWizEquivalent du repli pour ces bandes (sorties 1, 4, 7…). */
export function fallbackEquivalentLines(stripNames: string[], indent = '    '): string[] {
  const i2 = `${indent}  `;
  const i3 = `${indent}    `;
  const i4 = `${indent}      `;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    `${indent}<LedWizEquivalent>`,
    `${i2}<Name>LedWizEquivalent ${DOF_FALLBACK_NUMBER}</Name>`,
    `${i2}<Outputs>`,
    ...stripNames.flatMap((name, i) => [
      `${i3}<LedWizEquivalentOutput>`,
      `${i4}<OutputName>${esc(name.trim())}</OutputName>`,
      `${i4}<LedWizEquivalentOutputNumber>${1 + 3 * i}</LedWizEquivalentOutputNumber>`,
      `${i3}</LedWizEquivalentOutput>`,
    ]),
    `${i2}</Outputs>`,
    `${i2}<LedWizNumber>${DOF_FALLBACK_NUMBER}</LedWizNumber>`,
    `${indent}</LedWizEquivalent>`,
  ];
}

const FALLBACK_BLOCK = new RegExp(`[ \\t]*<LedWizEquivalent>(?:(?!</LedWizEquivalent>)[\\s\\S])*<Name>\\s*LedWizEquivalent ${DOF_FALLBACK_NUMBER}\\s*</Name>[\\s\\S]*?</LedWizEquivalent>\\r?\\n?`, 'g');

/** Cabinet.xml avec le LedWizEquivalent du repli pour ces bandes (remplacé s'il y est), ou sans lui (stripNames vide). */
export function withFallbackEquivalent(xml: string, stripNames: string[]): string {
  const eol = xml.includes('\r\n') ? '\r\n' : '\n';
  const without = xml.replace(FALLBACK_BLOCK, '');
  if (!stripNames.length) return without;
  const at = without.search(/[ \t]*<\/Toys>/);
  if (at < 0) return without;
  return `${without.slice(0, at)}${fallbackEquivalentLines(stripNames).join(eol)}${eol}${without.slice(at)}`;
}

export interface DofFallbackResult {
  /** Fichier du repli (écrit, gardé ou retiré). */
  file?: string;
  /** Ce qui a changé sur le disque. */
  wrote: boolean;
  removed: boolean;
  /** Cabinet.xml complété du LedWizEquivalent du repli, ou bandes en sommeil d'une partie en remplacement rendues. */
  cabinetUpdated: boolean;
  /** Pourquoi rien n'a pu être écrit (Cabinet.xml ou ini 99 écrits à la main). */
  refused?: string;
  plan?: DofFallbackPlan;
}

function readText(file: string, encoding: BufferEncoding = 'latin1'): string | undefined {
  try {
    return fs.readFileSync(file, encoding);
  } catch {
    return undefined;
  }
}

/**
 * Remet le repli à jour pour ces ROM : complète le Cabinet.xml de Cyber Pinball du LedWizEquivalent 99,
 * écrit directoutputconfig99.ini dans le dossier des ini de libdof (seulement s'il change), ou le retire
 * quand il n'y a rien à ajouter ou que le joueur a coupé l'option. Un fichier sans la marque de Cyber
 * Pinball n'est jamais touché. Des bandes restées en sommeil (partie en remplacement interrompue,
 * dof-remplacement.ts) sont rendues avant tout.
 */
export function refreshDofFallback(
  setup: DofSetup,
  roms: string[],
  opts: {
    enabled: boolean;
    palette?: (rom: string) => string[] | undefined;
    events?: (rom: string) => DofScriptEvents | undefined;
    classes?: (rom: string) => ReadonlyMap<number, DofEventClass> | undefined;
  },
): DofFallbackResult {
  const result: DofFallbackResult = { wrote: false, removed: false, cabinetUpdated: false };
  const cabinet = setup.cabinet;
  // Sorties en sommeil d'une partie précédente : rendues avant tout, quoi qu'il arrive ensuite.
  const wake = () => {
    if (cabinet && restoreDofReplacement(cabinet.file)) result.cabinetUpdated = true;
    return result;
  };
  const globalDir = setup.globalConfig ? path.dirname(setup.globalConfig.file) : setup.dir;
  const file = setup.fallbackIni ?? path.join(setup.iniDir ?? globalDir, `directoutputconfig${DOF_FALLBACK_NUMBER}.ini`);
  result.file = file;
  const existing = readText(file);
  if (existing !== undefined && !isOwnedFallbackIni(existing)) {
    result.refused = `${path.basename(file)}: not written by Cyber Pinball, left as is.`; // i18n-ignore : journal
    return wake();
  }
  const remove = () => {
    wake();
    if (existing === undefined) return result;
    try {
      fs.rmSync(file, { force: true });
      result.removed = true;
    } catch {
      /* fichier tenu : réessayé à la prochaine partie */
    }
    return result;
  };
  if (!opts.enabled || !cabinet?.strips.length) return remove();
  const stripNames = cabinet.strips.map((s) => s.name);
  const cabinetText = readText(cabinet.file, 'utf8');
  if (cabinetText === undefined) return remove();
  const configs = setup.ini.flatMap((f) => {
    const text = readText(f.file);
    return text === undefined ? [] : [parseDofIni(text, f.number)];
  });
  const equivalents: DofEquivalentOutputs[] = [
    ...cabinet.equivalents.filter((e) => e.number !== DOF_FALLBACK_NUMBER),
    { number: DOF_FALLBACK_NUMBER, outputs: stripNames.map((name, i) => ({ number: 1 + 3 * i, name })) },
  ];
  const plan = planDofFallback({
    configs,
    equivalents,
    strips: cabinet.strips,
    roms,
    ...(opts.palette ? { palette: opts.palette } : {}),
    ...(opts.events ? { events: opts.events } : {}),
    ...(opts.classes ? { classes: opts.classes } : {}),
  });
  result.plan = plan;
  if (!plan.content) return remove();
  // Cabinet.xml voulu : LedWizEquivalent du repli, bandes d'une partie en remplacement rendues.
  const wanted = withFallbackEquivalent(restoreDofSleep(cabinetText), stripNames);
  if (wanted !== cabinetText) {
    if (!cabinet.owned) {
      result.refused = `${path.basename(cabinet.file)}: hand-written, no LedWizEquivalent ${DOF_FALLBACK_NUMBER} for the fallback effects.`; // i18n-ignore : journal
      return remove();
    }
    writeFileAtomic(cabinet.file, wanted);
    result.cabinetUpdated = true;
  }
  if (existing !== plan.content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, plan.content, 'latin1');
    result.wrote = true;
  }
  return result;
}

/**
 * Rend les bandes mises en sommeil pour une partie en remplacement (fin de partie, ou avant toute autre
 * partie) ; true si Cabinet.xml a changé. Ne touche qu'aux commentaires marqués par Cyber Pinball.
 */
export function restoreDofReplacement(cabinetFile: string): boolean {
  const text = readText(cabinetFile, 'utf8');
  if (text === undefined || !hasDofSleep(text)) return false;
  try {
    writeFileAtomic(cabinetFile, restoreDofSleep(text));
    return true;
  } catch {
    return false; // fichier tenu : rendu à la prochaine remise à jour
  }
}
