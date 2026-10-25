// Remise aux touches par défaut des encodeurs (Maj, 1, Échap, 5, Entrée…), des boutons du
// jeu comme de ceux de l'interface (sur les flippers, Start et Exit), le recours
// quand un mauvais relevé de l'étape « Boutons » rend la borne impossible à piloter :
// menu système et réglages de VPX (à la souris), commande sync --boutons-par-defaut
// (lanceur, sans aucun bouton). cabinet.json d'abord, puis [Input] de VPinballX.ini.

import { isInputKey, loadCabinet, saveCabinet, t, tn, withDefaultButtons, type Cabinet } from '@cyberpinball/core';
import { observedDisplays } from './displays';
import { locations, vpxProfile } from './paths';
import { activeVpxIni, syncVpxIni, type VpxIniSync } from './vpx-ini';

export interface ButtonsReset {
  cabinet: Cabinet;
  sync: VpxIniSync;
  /** Clés [Input] réécrites. */
  written: number;
}

/** undefined : pas encore de borne configurée. */
export function resetButtons(): ButtonsReset | undefined {
  const loc = locations();
  const cabinet = loadCabinet(loc.dataDir);
  if (!cabinet) return undefined;
  const next = withDefaultButtons(cabinet);
  saveCabinet(loc.dataDir, next);
  // Comme l'étape « Boutons » seule : reprise en main des touches, et d'elles seules.
  const sync = syncVpxIni(loc.dataDir, activeVpxIni(loc), next, observedDisplays(), vpxProfile(loc).profile, isInputKey);
  return { cabinet: next, sync, written: sync.report ? sync.plan.changes.filter((c) => c.section === 'Input').length : 0 };
}

/** Compte rendu en clair, pour le menu, les réglages et la console. */
export function describeReset(reset: ButtonsReset): string[] {
  const blocking = reset.sync.plan.findings.filter((f) => f.severity === 'blocking');
  return [
    t('Flippers : Maj gauche / Maj droite · Start : 1 · Exit : Échap · Crédit : 5 · Lanceur : Entrée.'),
    t('Interface : précédent, suivant, valider, retour sur les flippers, Start et Exit.'),
    blocking.length
      ? t("VPinballX.ini n'a pas pu être mis à jour ({reasons}) ; il le sera au prochain démarrage.", { reasons: blocking.map((f) => f.message).join(' ') })
      : reset.written
        ? tn(reset.written, 'VPinballX.ini : {n} touche réécrite ([Input]).', 'VPinballX.ini : {n} touches réécrites ([Input]).')
        : t('VPinballX.ini avait déjà ces touches.'),
  ];
}
