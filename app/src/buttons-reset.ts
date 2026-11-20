// Remise aux touches par défaut des encodeurs (Maj, 1, Échap, 5, Entrée…), des boutons du
// jeu comme de ceux de l'interface (sur les flippers, Start et Exit), le recours
// quand un mauvais relevé de l'étape « Boutons » rend une borne au clavier impossible à piloter :
// menu système et réglages de VPX (à la souris), commande sync --boutons-par-defaut
// (lanceur, sans aucun bouton). cabinet.json d'abord, puis [Input] de VPinballX.ini.
//
// Garde-fous (19/11/2026, packages/core/src/buttons-backup.ts) : le menu et les réglages la
// refusent sur une borne aux boutons de joystick et la font confirmer ailleurs ; le relevé remplacé
// est toujours gardé et se rétablit (restoreButtons) ; chaque remise est consignée au journal.

import {
  clearButtonsBackup,
  defaultButtonsRefusal,
  isInputKey,
  joystickButtonCount,
  loadButtonsBackup,
  loadCabinet,
  saveButtonsBackup,
  saveCabinet,
  t,
  tn,
  withButtonsBackup,
  withDefaultButtons,
  type ButtonsBackup,
  type Cabinet,
} from '@cyberpinball/core';
import { observedDisplays } from './displays';
import { locations, vpxProfile } from './paths';
import { activeVpxIni, syncVpxIni, type VpxIniSync } from './vpx-ini';

export interface ButtonsReset {
  cabinet: Cabinet;
  sync: VpxIniSync;
  /** Clés [Input] réécrites. */
  written: number;
}

/** Ce que l'écran demande avant une remise : rien à remettre, refus (borne à joystick), ou la remise possible. */
export function resetCheck(): { state: 'none' } | { state: 'refused'; reason: string } | { state: 'ready' } {
  const cabinet = loadCabinet(locations().dataDir);
  if (!cabinet) return { state: 'none' };
  const reason = defaultButtonsRefusal(cabinet);
  return reason ? { state: 'refused', reason } : { state: 'ready' };
}

/** Écrit la borne et reprend [Input] de VPinballX.ini, comme l'étape « Boutons » seule. */
function apply(next: Cabinet): ButtonsReset {
  const loc = locations();
  saveCabinet(loc.dataDir, next);
  const sync = syncVpxIni(loc.dataDir, activeVpxIni(loc), next, observedDisplays(), vpxProfile(loc).profile, isInputKey);
  return { cabinet: next, sync, written: sync.report ? sync.plan.changes.filter((c) => c.section === 'Input').length : 0 };
}

/**
 * Touches par défaut des encodeurs, après avoir gardé le relevé remplacé. `origin` : qui l'a demandée
 * (journal). undefined : pas encore de borne configurée. Le refus d'une borne à joystick se décide
 * avant (resetCheck) : la commande sync, dernier recours sans bouton, passe outre.
 */
export function resetButtons(origin = 'commande'): ButtonsReset | undefined {
  const loc = locations();
  const cabinet = loadCabinet(loc.dataDir);
  if (!cabinet) return undefined;
  const backup = saveButtonsBackup(loc.dataDir, cabinet);
  const reset = apply(withDefaultButtons(cabinet));
  console.log(`Boutons : touches par défaut des encodeurs remises (${origin}) ; relevé remplacé gardé (${joystickButtonCount(cabinet)} bouton(s) de joystick, ${backup.at}), à rétablir par Menu système > Ma borne > Configuration de la borne.`); // i18n-ignore : journal
  return reset;
}

/** Relevé gardé par la dernière remise, s'il en reste un pour la configuration active. */
export function buttonsBackup(): ButtonsBackup | undefined {
  const loc = locations();
  const cabinet = loadCabinet(loc.dataDir) as (Cabinet & { id?: string }) | undefined;
  return cabinet ? loadButtonsBackup(loc.dataDir, cabinet.id) : undefined;
}

/** Remet le relevé gardé ; undefined : rien à rétablir. */
export function restoreButtons(): ButtonsReset | undefined {
  const loc = locations();
  const cabinet = loadCabinet(loc.dataDir) as (Cabinet & { id?: string }) | undefined;
  const backup = cabinet && loadButtonsBackup(loc.dataDir, cabinet.id);
  if (!cabinet || !backup) return undefined;
  const reset = apply(withButtonsBackup(cabinet, backup));
  clearButtonsBackup(loc.dataDir);
  console.log(`Boutons : relevé d'avant la remise du ${backup.at} rétabli (${joystickButtonCount(reset.cabinet)} bouton(s) de joystick).`); // i18n-ignore : journal
  return reset;
}

/** Ce que fait la remise, dit avant de la confirmer. */
export function resetConsequences(): string {
  return t('Chaque bouton de la borne, du jeu comme de l’interface, reprend la touche que les encodeurs envoient d’office : Maj pour les flippers, 1 pour Start, Échap pour Exit, 5 pour le crédit, Entrée pour le lanceur. À choisir seulement si vos boutons envoient ces touches de clavier. Le relevé actuel est gardé : « Rétablir les boutons d’avant » le remet.');
}

/** Compte rendu en clair, pour le menu, les réglages et la console. */
export function describeReset(reset: ButtonsReset): string[] {
  const blocking = reset.sync.plan.findings.filter((f) => f.severity === 'blocking');
  return [
    t('Flippers : Maj gauche / Maj droite · Start : 1 · Exit : Échap · Crédit : 5 · Lanceur : Entrée.'),
    t('Interface : précédent, suivant, valider, retour sur les flippers, Start et Exit.'),
    describeSync(reset, blocking),
  ];
}

/** Compte rendu d'un rétablissement. */
export function describeRestore(reset: ButtonsReset): string[] {
  const blocking = reset.sync.plan.findings.filter((f) => f.severity === 'blocking');
  return [t('Les boutons relevés avant la remise aux touches par défaut répondent de nouveau.'), describeSync(reset, blocking)];
}

function describeSync(reset: ButtonsReset, blocking: { message: string }[]): string {
  return blocking.length
    ? t("VPinballX.ini n'a pas pu être mis à jour ({reasons}) ; il le sera au prochain démarrage.", { reasons: blocking.map((f) => f.message).join(' ') })
    : reset.written
      ? tn(reset.written, 'VPinballX.ini : {n} touche réécrite ([Input]).', 'VPinballX.ini : {n} touches réécrites ([Input]).')
      : t('VPinballX.ini avait déjà ces touches.');
}
