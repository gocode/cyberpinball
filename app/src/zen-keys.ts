// Boutons de joystick de la borne rendus aux jeux de Zen (Pinball FX, Pinball FX3) comme des
// touches du clavier, pendant la partie : ces jeux ne lisent pas un joystick DirectInput (Pinscape,
// encodeur en mode manette), seulement le clavier et les manettes XInput. Correspondance et raisons
// dans packages/core/src/pinballfx-cabinet.ts.
//
// Borne au clavier dans Pinball FX3 : la touche d'un flipper arrive seule au jeu, sans la flèche de
// ses menus. Elle est lue par sondage (GetAsyncKeyState, KEYBOARD_POLL_MS), sans crochet clavier :
// rien ne s'intercale entre la touche et le jeu, le flipper ne prend aucun retard, et les flèches
// envoyées ne sont pas des touches lues (pas de boucle).
//
// Les touches ne partent que quand le jeu a le premier plan : un bouton appuyé pendant que le
// front-end est devant va au front-end (joystick-input.ts), jamais en double.

import { windowsVk, ZenKeyPresser, zenJoystickKeys, zenKeyboardEchoes, type ButtonsSource, type ZenGameKey } from '@cyberpinball/core';
import { foregroundWindow, keysDown, setKeyDown } from '@cyberpinball/win-displays';

/** Sondage des touches de flipper d'une borne au clavier : assez vif pour un menu, sans charge. */
export const KEYBOARD_POLL_MS = 15;

export interface ZenKeysSystem {
  /** Processus au premier plan. */
  foregroundPid(): number | undefined;
  /** Enfonce ou relâche une touche (code de touche virtuelle de Windows). */
  key(vk: number, down: boolean): void;
  /** Écoute les boutons du joystick ; rend de quoi arrêter. */
  watch(listener: (code: string, down: boolean) => void): () => void;
  /** Touches du clavier enfoncées parmi `vks`. Absent : les touches du clavier ne sont pas lues. */
  keysDown?(vks: readonly number[]): number[];
  /** Appelle `tick` toutes les `ms` ; rend de quoi arrêter. */
  every?(ms: number, tick: () => void): () => void;
}

const realSystem: ZenKeysSystem = {
  foregroundPid: () => foregroundWindow()?.pid,
  key: (vk, down) => void setKeyDown(vk, down),
  // Chargé à l'usage : les essais du pont, sans Electron, passent leur propre système.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  watch: (listener) => (require('./joystick-input') as typeof import('./joystick-input')).watchJoystickButtons(listener),
  keysDown: (vks) => keysDown(vks),
  every: (ms, tick) => {
    const timer = setInterval(tick, ms);
    return () => clearInterval(timer);
  },
};

/**
 * Rend au jeu `gamePid()` les boutons de joystick de la borne sous forme des touches des encodeurs
 * pour leur rôle en jeu, jusqu'à l'arrêt (la fonction rendue), qui relâche aussi les touches encore
 * tenues. `game` : le jeu de Zen lancé, pour ses touches propres (Pinball FX3 : flèches gauche et
 * droite aux flippers, envoyées aussi pour des flippers au clavier). Rien à faire sur une borne dont
 * aucun bouton n'est à rejouer. À l'arrêt, le journal compte les appuis envoyés au jeu et ceux
 * gardés (jeu pas au premier plan).
 */
export function bridgeZenKeys(source: ButtonsSource, gamePid: () => number | undefined, system: ZenKeysSystem = realSystem, game?: ZenGameKey): () => void {
  const keys = zenJoystickKeys(source, game);
  const echoes = system.keysDown && system.every ? zenKeyboardEchoes(source, game) : new Map<string, string[]>();
  if (keys.size === 0 && echoes.size === 0) return () => undefined;
  const presser = new ZenKeyPresser(new Map([...keys, ...echoes]));
  let sent = 0;
  let held = 0;
  const send = (key: string, down: boolean) => {
    const vk = windowsVk(key);
    if (vk !== undefined) system.key(vk, down);
  };
  /** Appui (`down`) ou relâchement du bouton `code` : un appui ne part que vers le jeu ; un relâchement suit toujours l'appui qu'il termine. */
  const button = (code: string, down: boolean) => {
    if (down) {
      const pid = gamePid();
      if (pid === undefined || system.foregroundPid() !== pid) {
        held++;
        return;
      }
      sent++;
    }
    for (const k of presser.press(code, down)) send(k.key, k.down);
  };
  const stopWatch = keys.size
    ? system.watch((code, down) => {
        if (keys.has(code)) button(code, down);
      })
    : () => undefined;
  // Touches de flipper au clavier : appuis et relâchements vus d'un sondage à l'autre.
  const polled = [...echoes.keys()].map((code) => ({ code, vk: windowsVk(code)! }));
  const pressed = new Set<string>();
  const stopPoll = polled.length
    ? system.every!(KEYBOARD_POLL_MS, () => {
        const down = new Set(system.keysDown!(polled.map((p) => p.vk)));
        for (const { code, vk } of polled) {
          const now = down.has(vk);
          if (now === pressed.has(code)) continue;
          if (now) pressed.add(code);
          else pressed.delete(code);
          button(code, now);
        }
      })
    : () => undefined;
  if (keys.size) console.log(`Jeu de Zen : ${keys.size} bouton(s) du joystick rendus au jeu comme des touches du clavier.`); // i18n-ignore : journal
  if (polled.length) console.log(`Jeu de Zen : ${polled.length} flipper(s) au clavier (${polled.map((p) => p.code).join(', ')}) doublés des flèches des menus.`); // i18n-ignore : journal
  return () => {
    stopWatch();
    stopPoll();
    for (const key of presser.releaseAll()) send(key, false);
    console.log(`Jeu de Zen : ${sent} appui(s) de bouton envoyé(s) au jeu, ${held} gardé(s) (jeu pas au premier plan).`); // i18n-ignore : journal
  };
}
