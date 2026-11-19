// Boutons de joystick de la borne rendus aux jeux de Zen (Pinball FX, Pinball FX3) comme des
// touches du clavier, pendant la partie : ces jeux ne lisent pas un joystick DirectInput (Pinscape,
// encodeur en mode manette), seulement le clavier et les manettes XInput. Correspondance et raisons
// dans packages/core/src/pinballfx-cabinet.ts.
//
// Les touches ne partent que quand le jeu a le premier plan : un bouton appuyé pendant que le
// front-end est devant va au front-end (joystick-input.ts), jamais en double.

import { windowsVk, ZenKeyPresser, zenJoystickKeys, type ButtonsSource, type ZenGameKey } from '@cyberpinball/core';
import { foregroundWindow, setKeyDown } from '@cyberpinball/win-displays';

export interface ZenKeysSystem {
  /** Processus au premier plan. */
  foregroundPid(): number | undefined;
  /** Enfonce ou relâche une touche (code de touche virtuelle de Windows). */
  key(vk: number, down: boolean): void;
  /** Écoute les boutons du joystick ; rend de quoi arrêter. */
  watch(listener: (code: string, down: boolean) => void): () => void;
}

const realSystem: ZenKeysSystem = {
  foregroundPid: () => foregroundWindow()?.pid,
  key: (vk, down) => void setKeyDown(vk, down),
  // Chargé à l'usage : les essais du pont, sans Electron, passent leur propre système.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  watch: (listener) => (require('./joystick-input') as typeof import('./joystick-input')).watchJoystickButtons(listener),
};

/**
 * Rend au jeu `gamePid()` les boutons de joystick de la borne sous forme des touches des encodeurs
 * pour leur rôle en jeu, jusqu'à l'arrêt (la fonction rendue), qui relâche aussi les touches encore
 * tenues. Rien à faire sur une borne dont aucun bouton n'est un bouton de joystick. `game` : le jeu
 * de Zen lancé, pour ses touches propres (Pinball FX3 : flèches gauche et droite aux flippers).
 * À l'arrêt, le journal compte les appuis envoyés au jeu et ceux gardés (jeu pas au premier plan).
 */
export function bridgeZenKeys(source: ButtonsSource, gamePid: () => number | undefined, system: ZenKeysSystem = realSystem, game?: ZenGameKey): () => void {
  const keys = zenJoystickKeys(source, game);
  if (keys.size === 0) return () => undefined;
  const presser = new ZenKeyPresser(keys);
  let sent = 0;
  let held = 0;
  const send = (key: string, down: boolean) => {
    const vk = windowsVk(key);
    if (vk !== undefined) system.key(vk, down);
  };
  const stopWatch = system.watch((code, down) => {
    if (!keys.has(code)) return;
    // Un appui ne part que vers le jeu ; un relâchement suit toujours l'appui qu'il termine.
    if (down) {
      const pid = gamePid();
      if (pid === undefined || system.foregroundPid() !== pid) {
        held++;
        return;
      }
      sent++;
    }
    for (const k of presser.press(code, down)) send(k.key, k.down);
  });
  console.log(`Jeu de Zen : ${keys.size} bouton(s) du joystick rendus au jeu comme des touches du clavier.`); // i18n-ignore : journal
  return () => {
    stopWatch();
    for (const key of presser.releaseAll()) send(key, false);
    console.log(`Jeu de Zen : ${sent} appui(s) de bouton envoyé(s) au jeu, ${held} gardé(s) (jeu pas au premier plan).`); // i18n-ignore : journal
  };
}
