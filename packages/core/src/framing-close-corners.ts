// Essais « Plein cadre, au plus près des coins » (24/11/2026), pour UNE table, jamais pour la borne. Le banc de rendu
// (scripts/banc-cadrage.ps1) montre qu'en vue borne le plateau est un trapèze : la perspective rétrécit son fond, et
// l'étirement horizontal ne le redresse pas. Ce qui rapproche les coins du plateau de ceux de l'écran, c'est un étirement
// plafonné à 50 % et un œil haut (ScreenPlayerZ). Mesuré sur 4 tables : mieux sur Monster Bash et Space Cadet, sans
// effet sur Attack from Mars, moins bien sur Addams Family. Aucun alignement n'est donc promis : c'est un essai, montré
// sur l'aperçu rendu de la table, à comparer aux autres cadrages.
// Deux variantes, selon la pose de l'écran dans la caisse (retour d'un joueur, 24/11/2026) :
// - « écran incliné » : l'écran penche (cas le plus courant), le fond du plateau est un peu tronqué pour que les coins
//   du plateau restent dans ceux de l'écran ;
// - « écran à plat » : l'écran est collé sans inclinaison.
// Œil : celui qu'un joueur a réglé à la main sur Monster Bash (Y 2,5 / Z 100 : le maximum du curseur de VPX ; l'ancien essai,
// Z 150, sortait de la plage que l'interface de VPX sait régler). Son réglage fin (fenêtre de verre abaissée, échelles)
// est propre à chaque table : il ne se transpose pas, c'est l'aperçu qui juge.
// L'œil (ScreenPlayerY / Z) et l'inclinaison sont la calibration de la borne : ils ne sont écrits que dans le .ini de la
// table, jamais dans VPinballX.ini, et retirés de la table dès qu'un autre cadrage la reprend (stripCloseCorners).

import { IniDocument } from './ini';
import { FRAMING_STYLE_KEYS } from './framing-styles';

export type CloseCornersVariant = 'incline' | 'plat';

export const CLOSE_CORNERS_VARIANTS: CloseCornersVariant[] = ['incline', 'plat'];

/** L'inclinaison de l'écran (degrés) que chaque variante écrit : sa signature avec l'œil. */
export const CLOSE_CORNERS_INCLINATION: Record<CloseCornersVariant, string> = { incline: '6', plat: '0' };

/** La position de l'œil des essais : sa signature dans le .ini de la table (une valeur qu'un joueur ne règle pas par hasard). */
export const CLOSE_CORNERS_EYE = { ScreenPlayerY: '2.5', ScreenPlayerZ: '100' } as const;

/** L'œil de la première version de l'essai (0.2.4-essai.2x) : encore reconnu pour être retiré d'une table qui l'a gardé. */
const LEGACY_EYE = { ScreenPlayerY: '-20', ScreenPlayerZ: '150' } as const;

const EYE_KEYS = Object.keys(CLOSE_CORNERS_EYE) as (keyof typeof CLOSE_CORNERS_EYE)[];

const sameEye = (doc: IniDocument, eye: Record<string, string>) => EYE_KEYS.every((k) => Number(doc.get('Player', k)?.trim()) === Number(eye[k]));

/** Le .ini de la table porte la position d'œil d'un essai (et elle seule : une autre valeur est celle du joueur). */
export function hasCloseCornersEye(doc: IniDocument): boolean {
  return sameEye(doc, CLOSE_CORNERS_EYE) || sameEye(doc, LEGACY_EYE);
}

/** La variante en place : étirement large, haut gardé, œil de l'essai et son inclinaison ; undefined : aucune. */
export function closeCornersVariant(doc: IniDocument): CloseCornersVariant | undefined {
  if (!sameEye(doc, CLOSE_CORNERS_EYE)) return undefined;
  const top = doc.get('Player', 'CabinetAutofitKeepTop')?.trim() ?? '';
  if (
    doc.get('Player', 'CabinetAutofitMode')?.trim() !== '1' ||
    !(top === '1' || /^true$/i.test(top)) ||
    Number(doc.get('Player', 'CabinetAutofitMaxStretch') ?? '0') < 0.45
  ) {
    return undefined;
  }
  const inclination = Number(doc.get('Player', 'ScreenInclination')?.trim() || '0');
  return CLOSE_CORNERS_VARIANTS.find((v) => inclination === Number(CLOSE_CORNERS_INCLINATION[v]));
}

/** Un essai est en place (n'importe quelle variante). */
export function closeCornersHolds(doc: IniDocument): boolean {
  return closeCornersVariant(doc) !== undefined;
}

/** Retire l'œil et l'inclinaison de l'essai quand un autre cadrage reprend la table ; sans la signature de l'essai, rien n'est touché. */
export function stripCloseCorners(doc: IniDocument): void {
  if (!hasCloseCornersEye(doc)) return;
  for (const k of EYE_KEYS) doc.remove('Player', k);
  const inclination = doc.get('Player', 'ScreenInclination')?.trim();
  if (inclination !== undefined && CLOSE_CORNERS_VARIANTS.some((v) => Number(inclination || '0') === Number(CLOSE_CORNERS_INCLINATION[v]))) doc.remove('Player', 'ScreenInclination');
}

/** Le .ini de la table avec l'essai (VPX corrigé seulement : il faut garder le haut). Ses autres réglages sont gardés. */
export function withCloseCorners(tableIni: string, variant: CloseCornersVariant = 'incline'): string {
  const doc = IniDocument.parse(tableIni);
  stripCloseCorners(doc);
  for (const key of FRAMING_STYLE_KEYS) doc.remove('Player', key);
  doc.set('Player', 'CabinetAutofitMode', '1');
  doc.set('Player', 'CabinetAutofitKeepTop', '1');
  doc.set('Player', 'CabinetAutofitMaxStretch', '0.5');
  doc.set('Player', 'CabinetAutofitPos', '0.05');
  for (const k of EYE_KEYS) doc.set('Player', k, CLOSE_CORNERS_EYE[k]);
  doc.set('Player', 'ScreenInclination', CLOSE_CORNERS_INCLINATION[variant]);
  return doc.toString();
}
