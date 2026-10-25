// Premier plan de Windows : là où vont les touches du clavier.
//
// Electron tient une fenêtre pour active (BrowserWindow.getFocusedWindow, isFocused) dès
// qu'elle l'est pour son fil, même quand Windows a refusé de la mettre au premier plan
// (verrou de premier plan : processus relancé, lancé sans droit au premier plan). Les
// boutons du joystick, que joystick-input.ts remet à la fenêtre active, y arrivent ; les
// touches du clavier, que Windows envoie au premier plan, vont ailleurs. Octobre 2026,
// vraie borne à Pinscape (0.1.3-essai.1) : boutons du joystick relevés à l'étape « Boutons »,
// touche du clavier jamais reçue. Chaque appui d'un bouton du joystick vérifie donc que le
// clavier suit (keyboardFollows), et l'assistant reprend le premier plan en s'ouvrant.

import type { BrowserWindow } from 'electron';
import { bringToFront, foregroundWindow, windowOfHandle } from '@cyberpinball/win-displays';
import { isShown, OFFSCREEN } from './offscreen';

/** Dernière fenêtre étrangère signalée : un seul avertissement tant qu'elle garde le clavier. */
let reported: bigint | undefined;
/** Dernière fois que le clavier était ailleurs : à qui, et s'il est revenu (affiché par l'étape « Boutons »). */
let incident: { holder: string; back: boolean } | undefined;

/** Le clavier a été trouvé ailleurs depuis le démarrage : la fenêtre qui l'avait, et s'il est revenu. */
export function keyboardIncident(): { holder: string; back: boolean } | undefined {
  return incident;
}

/**
 * Le clavier va à une fenêtre de Cyber Pinball ; sinon `win` reprend le premier plan.
 * Vrai si le clavier est (ou revient) ici. Hors écran, rien n'est jamais mis au premier
 * plan : vrai. `why` dit, dans l'avertissement de la console, ce qui s'en est aperçu.
 */
export function keyboardFollows(win: BrowserWindow, why: string): boolean {
  if (OFFSCREEN || !isShown(win)) return true;
  let front;
  try {
    front = foregroundWindow();
  } catch {
    return true; // API de Windows indisponible : rien à vérifier
  }
  if (front?.pid === process.pid) {
    reported = undefined;
    return true;
  }
  const target = windowOfHandle(win.getNativeWindowHandle().readBigUInt64LE(0));
  const back = target ? bringToFront(target) : false;
  const holder = front ? `« ${front.title || front.className} » (${front.pid})` : '—';
  incident = { holder, back };
  if (front?.handle !== reported) {
    reported = front?.handle;
    console.warn(`Clavier : le premier plan de Windows était à ${holder} alors que ${why} ; ${back ? 'premier plan repris' : 'premier plan refusé par Windows'}.`); // i18n-ignore : console
  }
  return back;
}
