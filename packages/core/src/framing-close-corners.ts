// Essai « Plein cadre, au plus près des coins » (24/11/2026), pour UNE table, jamais pour la borne. Le banc de rendu
// (scripts/banc-cadrage.ps1) montre qu'en vue borne le plateau est un trapèze : la perspective rétrécit son fond, et
// l'étirement horizontal ne le redresse pas. Ce qui rapproche les coins du plateau de ceux de l'écran, c'est un étirement
// plafonné à 50 % et un œil plus haut (ScreenPlayerZ). Mesuré sur 4 tables : mieux sur Monster Bash et Space Cadet, sans
// effet sur Attack from Mars, moins bien sur Addams Family. Aucun alignement n'est donc promis : c'est un essai, montré
// sur l'aperçu rendu de la table, à comparer aux autres cadrages.
// L'œil (ScreenPlayerY / Z) est la calibration de la borne : il n'est écrit que dans le .ini de la table, jamais dans
// VPinballX.ini, et retiré de la table dès qu'un autre cadrage la reprend (stripCloseCorners).

import { IniDocument } from './ini';
import { FRAMING_STYLE_KEYS } from './framing-styles';

/** La position de l'œil de l'essai : sa signature dans le .ini de la table (une valeur qu'un joueur ne règle pas par hasard). */
export const CLOSE_CORNERS_EYE = { ScreenPlayerY: '-20', ScreenPlayerZ: '150' } as const;

const EYE_KEYS = Object.keys(CLOSE_CORNERS_EYE) as (keyof typeof CLOSE_CORNERS_EYE)[];

/** Le .ini de la table porte la position d'œil de l'essai (et elle seule : une autre valeur est celle du joueur). */
export function hasCloseCornersEye(doc: IniDocument): boolean {
  return EYE_KEYS.every((k) => Number(doc.get('Player', k)?.trim()) === Number(CLOSE_CORNERS_EYE[k]));
}

/** L'essai est en place : étirement large, haut gardé, œil de l'essai. */
export function closeCornersHolds(doc: IniDocument): boolean {
  if (!hasCloseCornersEye(doc)) return false;
  const top = doc.get('Player', 'CabinetAutofitKeepTop')?.trim() ?? '';
  return (
    doc.get('Player', 'CabinetAutofitMode')?.trim() === '1' &&
    (top === '1' || /^true$/i.test(top)) &&
    Number(doc.get('Player', 'CabinetAutofitMaxStretch') ?? '0') >= 0.45
  );
}

/** Retire l'œil de l'essai quand un autre cadrage reprend la table ; sans la signature de l'essai, rien n'est touché. */
export function stripCloseCorners(doc: IniDocument): void {
  if (!hasCloseCornersEye(doc)) return;
  for (const k of EYE_KEYS) doc.remove('Player', k);
}

/** Le .ini de la table avec l'essai (VPX corrigé seulement : il faut garder le haut). Ses autres réglages sont gardés. */
export function withCloseCorners(tableIni: string): string {
  const doc = IniDocument.parse(tableIni);
  for (const key of FRAMING_STYLE_KEYS) doc.remove('Player', key);
  doc.set('Player', 'CabinetAutofitMode', '1');
  doc.set('Player', 'CabinetAutofitKeepTop', '1');
  doc.set('Player', 'CabinetAutofitMaxStretch', '0.5');
  doc.set('Player', 'CabinetAutofitPos', '0.05');
  for (const k of EYE_KEYS) doc.set('Player', k, CLOSE_CORNERS_EYE[k]);
  return doc.toString();
}
