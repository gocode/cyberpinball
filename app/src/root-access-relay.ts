// Root Access (root-access.ts) : le relais des commandes de la borne vers la page du jeu. Sans Electron,
// pour que les tests du cœur le chargent tel quel.
//
// Les touches sont lues par Windows (GetAsyncKeyState, comme le relais des applications) : elles restent
// justes quand les deux Maj sont tenues, où les événements de la page perdent un relâchement. Les boutons
// de joystick viennent de SDL, la tirette du lanceur analogique de son axe réglé (zone morte et sens compris).

import { miniGameInput, miniGameKeys, plungerPull, sameMiniGameInput, windowsVk, type AxisReading, type CabinetButtons, type MiniGameButton, type MiniGameInput, type PlungerSensor } from '@cyberpinball/core';

export interface RelayInput {
  /** Boutons relevés de la borne (buttonKeys en fait la liste, défauts compris). */
  buttons: CabinetButtons | undefined;
  /** Lanceur analogique réglé ; undefined : lanceur à bouton. */
  plungerSensor: PlungerSensor | undefined;
  axes(): AxisReading[];
  /** Codes de touche virtuelle enfoncés parmi ceux demandés (GetAsyncKeyState). */
  keysDown(vks: readonly number[]): number[];
  /** Boutons du joystick appuyés ou relâchés ; rend de quoi arrêter. */
  watchJoystick(listener: (code: string, down: boolean) => void): () => void;
  /** L'état des commandes, à chaque changement. */
  send(input: MiniGameInput): void;
  /** Un geste du joueur sur un bouton (pas la tirette, que le bruit du capteur fait bouger). */
  activity(): void;
  /** Exit appuyé : fermer le jeu. */
  exit(): void;
  /** Intervalle de lecture ; 0 : seulement par tick() (essais). */
  pollMs: number;
}

export interface Relay {
  /** Une lecture, tout de suite. */
  tick(): void;
  /** La page (re)chargée n'a rien reçu : l'état repart à la lecture suivante. */
  resend(): void;
  stop(): void;
}

export function relayCabinet(input: RelayInput): Relay {
  const entries = Object.entries(miniGameKeys(input.buttons)) as [MiniGameButton, string][];
  const vks = entries.flatMap(([b, c]) => {
    const vk = c.startsWith('SDLJoy_') ? undefined : windowsVk(c);
    return vk === undefined ? [] : [[b, vk] as const];
  });
  const joy = new Map(entries.filter(([, c]) => c.startsWith('SDLJoy_')).map(([b, c]) => [c, b]));
  const byKey = new Set<MiniGameButton>();
  const byJoy = new Set<MiniGameButton>();
  let sent: MiniGameInput | undefined;
  // Exit déjà tenu à l'ouverture ne ferme pas : il faut un nouvel appui.
  let exitWas: boolean | undefined;
  let stopped = false;

  function tick(): void {
    if (stopped) return;
    if (vks.length) {
      try {
        const down = input.keysDown(vks.map(([, v]) => v));
        byKey.clear();
        for (const [b, v] of vks) if (down.includes(v)) byKey.add(b);
      } catch {
        // API de Windows indisponible : le joystick seul.
      }
    }
    const held = new Set([...byKey, ...byJoy]);
    const exit = held.has('exit');
    if (exit && exitWas === false) {
      exitWas = exit;
      return input.exit();
    }
    exitWas = exit;
    const now = miniGameInput(held, plungerPull(input.axes(), input.plungerSensor));
    if (sameMiniGameInput(sent, now)) return;
    if (sent && (sent.left !== now.left || sent.right !== now.right || sent.plunger !== now.plunger || sent.aimant !== now.aimant)) input.activity();
    sent = now;
    input.send(now);
  }

  const timer = input.pollMs > 0 ? setInterval(tick, input.pollMs) : undefined;
  const stopJoy = joy.size
    ? input.watchJoystick((code, down) => {
        const b = joy.get(code);
        if (!b) return;
        if (down) byJoy.add(b);
        else byJoy.delete(b);
        tick();
      })
    : undefined;

  return {
    tick,
    resend: () => {
      sent = undefined;
    },
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stopJoy?.();
    },
  };
}
