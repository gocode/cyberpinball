// INI de VPX pour une partie enregistrée (« Jouer et enregistrer », game-recording.ts) : celui de la
// borne, le balancier simulé éteint. VPX dessine lui-même son balancier dans l'image du plateau
// (src/ui/live/PlumbOverlay.cpp, identique en 10.8.1) : un cercle rouge et un point en bas à gauche
// du joueur, dès que le balancier bouge (une secousse), effacé en deux secondes. Il entrait dans les
// vidéos de la roue (prise du 12/11/2026, borne à accéléromètre). Aucun réglage ne le masque seul :
// seul `[Player] SimulatedPlumb = 0` l'éteint, et avec lui le tilt aux secousses de cette partie (les
// secousses bougent toujours la bille ; un balancier câblé, lui, reste actif).
//
// VPX réécrit l'INI qu'il a reçu en quittant (réglages changés en partie) : ce qu'il y a changé est
// reporté dans l'INI de la borne, sauf le balancier.

import { IniDocument } from './ini';
import { iniBool, type VpxSetting } from './vpx';

const PLAYER = 'Player';
const PLUMB = 'SimulatedPlumb';

/** INI de la partie enregistrée, d'après celui de la borne ; undefined quand le balancier n'est pas simulé (rien à changer). */
export function recordingIniText(base: string): string | undefined {
  const doc = IniDocument.parse(base);
  // Absent : VPX simule le balancier (1 par défaut, Settings_properties.inl).
  if (!(iniBool(doc.get(PLAYER, PLUMB)) ?? true)) return undefined;
  doc.set(PLAYER, PLUMB, '0');
  return doc.toString();
}

/**
 * Réglages que VPX a changés pendant la partie enregistrée (`after` contre `launched`, l'INI qu'il a
 * reçu), à reporter dans l'INI de la borne ; jamais le balancier éteint pour la prise.
 */
export function recordingIniCarryBack(launched: string, after: string): VpxSetting[] {
  if (!after.trim()) return [];
  const before = IniDocument.parse(launched);
  const out: VpxSetting[] = [];
  for (const e of IniDocument.parse(after).entries()) {
    if (e.section.toLowerCase() === PLAYER.toLowerCase() && e.key.toLowerCase() === PLUMB.toLowerCase()) continue;
    if (before.get(e.section, e.key) !== e.value) out.push({ section: e.section, key: e.key, value: e.value });
  }
  return out;
}
