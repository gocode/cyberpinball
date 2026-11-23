// Garde-fous de la remise aux touches par défaut des encodeurs (19/11/2026). Sur un PinCab dont les
// boutons sont des boutons de joystick (Pinscape), une seule pression sur « Touches par défaut des
// encodeurs » avait remplacé le relevé par des touches de clavier que la borne n'envoie pas : plus
// aucun bouton ne répondait, donc plus moyen de revenir en arrière, et rien n'en gardait trace.
//
// Trois règles, pour toute borne :
// - un relevé qui contient des boutons de joystick n'est jamais remplacé par les touches de clavier
//   (defaultButtonsRefusal) : elles ne peuvent pas le remplacer ; on refait l'étape « Boutons » ;
// - avant toute remise, le relevé remplacé est gardé (boutons-precedents.json), et se rétablit ;
// - la remise se confirme, et se consigne au journal (app/src/buttons-reset.ts).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { isInputKey, joystickButton } from './buttons';
import { t } from './i18n';
import type { Cabinet } from './model';

/** Relevé remplacé par la dernière remise aux touches par défaut, dans le dossier des données. */
export const BUTTONS_BACKUP_FILE = 'boutons-precedents.json';

export interface ButtonsBackup {
  /** Configuration de la borne dont c'est le relevé (cabinet.json), si elle en a une. */
  configuration?: string;
  /** Date de la remise (ISO). */
  at: string;
  buttons?: Cabinet['buttons'];
  navigation?: Cabinet['navigation'];
  /** Réglages [Input] laissés à la main dans VPX, que la remise reprend. */
  vpxManual?: string[];
}

type ButtonsOf = Pick<Cabinet, 'buttons' | 'navigation'>;

/** Boutons de joystick distincts du relevé (boutons du jeu et de l'interface). */
export function joystickButtonCount(cabinet: ButtonsOf | undefined): number {
  const codes = [...Object.values(cabinet?.buttons ?? {}), ...Object.values(cabinet?.navigation ?? {})];
  return new Set(codes.filter((c): c is string => typeof c === 'string' && joystickButton(c) !== undefined)).size;
}

/**
 * Pourquoi les touches par défaut des encodeurs ne peuvent pas remplacer ce relevé ; undefined : elles
 * le peuvent (borne au clavier). Une borne aux boutons de joystick n'envoie aucune de ces touches.
 */
export function defaultButtonsRefusal(cabinet: ButtonsOf | undefined): string | undefined {
  const n = joystickButtonCount(cabinet);
  if (n === 0) return undefined;
  return t('Les boutons de cette borne sont des boutons de joystick ({n}, Pinscape ou encodeur en mode manette) : des touches de clavier ne peuvent pas les remplacer, et plus aucun bouton ne répondrait. Pour changer un bouton, refais l’étape « Boutons ».', { n });
}

/** Garde le relevé que la remise va remplacer. */
export function saveButtonsBackup(dataDir: string, cabinet: Cabinet & { id?: string }, at = new Date()): ButtonsBackup {
  const backup: ButtonsBackup = {
    ...(cabinet.id ? { configuration: cabinet.id } : {}),
    at: at.toISOString(),
    ...(cabinet.buttons ? { buttons: { ...cabinet.buttons } } : {}),
    ...(cabinet.navigation ? { navigation: { ...cabinet.navigation } } : {}),
    ...(cabinet.vpxManual?.length ? { vpxManual: [...cabinet.vpxManual] } : {}),
  };
  writeFileAtomic(path.join(dataDir, BUTTONS_BACKUP_FILE), JSON.stringify(backup, null, 2) + '\n');
  return backup;
}

/** Relevé gardé pour cette configuration (ou sans configuration désignée) ; undefined : rien à rétablir. */
export function loadButtonsBackup(dataDir: string, configuration?: string): ButtonsBackup | undefined {
  let backup: ButtonsBackup;
  try {
    backup = JSON.parse(fs.readFileSync(path.join(dataDir, BUTTONS_BACKUP_FILE), 'utf8')) as ButtonsBackup;
  } catch {
    return undefined;
  }
  if (!backup || typeof backup.at !== 'string' || (!backup.buttons && !backup.navigation)) return undefined;
  if (configuration && backup.configuration && backup.configuration !== configuration) return undefined;
  return backup;
}

export function clearButtonsBackup(dataDir: string): void {
  fs.rmSync(path.join(dataDir, BUTTONS_BACKUP_FILE), { force: true });
}

/** La borne avec le relevé gardé : boutons, interface, et ses réglages [Input] laissés à la main. */
export function withButtonsBackup<C extends Cabinet>(cabinet: C, backup: ButtonsBackup): C {
  const others = (cabinet.vpxManual ?? []).filter((id) => !isInputKey(id));
  const manual = [...new Set([...others, ...(backup.vpxManual ?? []).filter((id) => isInputKey(id))])];
  const next: C = { ...cabinet };
  if (backup.buttons) next.buttons = { ...backup.buttons };
  else delete next.buttons;
  if (backup.navigation) next.navigation = { ...backup.navigation };
  else delete next.navigation;
  if (manual.length) next.vpxManual = manual;
  else delete next.vpxManual;
  return next;
}
