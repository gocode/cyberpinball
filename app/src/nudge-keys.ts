// Secousses de la borne (accéléromètre relevé par l'étape « Tilt ») rendues à un jeu qui ne lit que le
// clavier, comme ses touches de secousse : Future Pinball (20/11/2026). Le détecteur est dans le cœur
// (packages/core/src/nudge-keys.ts) ; ici, le sondage des axes et la frappe des touches, seulement quand
// le jeu a le premier plan (comme les boutons, zen-keys.ts).

import { NudgeDetector, windowsVk, type NudgeSensor, type NudgeSide } from '@cyberpinball/core';
import { foregroundWindow, setKeyDown } from '@cyberpinball/win-displays';

/** Sondage des axes : assez vif pour saisir un à-coup de quelques centièmes de seconde. */
export const NUDGE_POLL_MS = 10;
/** Durée de la frappe d'une touche de secousse. */
export const NUDGE_TAP_MS = 60;

export interface NudgeKeysSystem {
  /** Valeurs des axes de l'appareil `device` (-1 à 1), ou undefined s'il n'est pas lu. */
  axes(device: string): number[] | undefined;
  foregroundPid(): number | undefined;
  key(vk: number, down: boolean): void;
  every(ms: number, tick: () => void): () => void;
  later(ms: number, run: () => void): void;
  now(): number;
}

const realSystem: NudgeKeysSystem = {
  axes: (device) => {
    // Chargé à l'usage : les essais du relais, sans Electron, passent leur propre système.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { joystickAxes } = require('./joystick-input') as typeof import('./joystick-input');
    return joystickAxes().find((r) => r.device === device)?.values;
  },
  foregroundPid: () => foregroundWindow()?.pid,
  key: (vk, down) => void setKeyDown(vk, down),
  every: (ms, tick) => {
    const timer = setInterval(tick, ms);
    return () => clearInterval(timer);
  },
  later: (ms, run) => void setTimeout(run, ms),
  now: () => Date.now(),
};

/**
 * Suit l'accéléromètre `sensor` et frappe la touche de secousse du côté détecté (`keys`, KeyboardEvent.code)
 * dans le jeu `gamePid()`, jusqu'à l'arrêt (la fonction rendue). Un côté sans touche est ignoré. À l'arrêt,
 * le journal compte les secousses envoyées et celles gardées (jeu pas au premier plan).
 */
export function bridgeNudgeKeys(
  sensor: NudgeSensor,
  keys: Partial<Record<NudgeSide, string>>,
  gamePid: () => number | undefined,
  name: string,
  system: NudgeKeysSystem = realSystem,
): () => void {
  const detector = new NudgeDetector(sensor);
  const sent: Record<NudgeSide, number> = { left: 0, right: 0, up: 0 };
  let held = 0;
  const stop = system.every(NUDGE_POLL_MS, () => {
    const values = system.axes(sensor.device);
    if (!values) return;
    const side = detector.read(values[sensor.x] ?? 0, values[sensor.y] ?? 0, system.now());
    if (!side) return;
    const vk = keys[side] ? windowsVk(keys[side]!) : undefined;
    if (vk === undefined) return;
    const pid = gamePid();
    if (pid === undefined || system.foregroundPid() !== pid) {
      held++;
      return;
    }
    sent[side]++;
    system.key(vk, true);
    system.later(NUDGE_TAP_MS, () => system.key(vk, false));
  });
  console.log(`${name} : secousses de l'accéléromètre (${sensor.name ?? sensor.device}) rendues au jeu comme ses touches de secousse.`); // i18n-ignore : journal
  return () => {
    stop();
    console.log(`${name} : secousses envoyées au jeu : ${sent.left} à gauche, ${sent.right} à droite, ${sent.up} vers l'avant ; ${held} gardée(s) (jeu pas au premier plan).`); // i18n-ignore : journal
  };
}
