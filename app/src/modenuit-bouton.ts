// Bouton du mode nuit (buttons.ts, `nightMode`, bouton avancé) : un appui bascule le mode, au front-end
// comme pendant une partie. Lu comme les boutons de volume (cabinet-volume.ts), quelle que soit la
// fenêtre au premier plan (VPX en partie) : touches du clavier par GetAsyncKeyState, boutons du joystick
// par le sondage de SDL. Seul le front d'appui compte : un bouton tenu ne bascule qu'une fois.
//
// Hors écran (essais sans opérateur), GetAsyncKeyState ne voit rien : les appuis arrivent par les
// fenêtres du menu (autopilote), comme pour le volume.

import { buttonKeys, windowsVk, type CabinetButtons } from '@cyberpinball/core';
import { keysDown } from '@cyberpinball/win-displays';
import type { Input } from 'electron';
import { joystickButtonsHeld, watchJoystickButtons } from './joystick-input';
import { OFFSCREEN } from './offscreen';

/** Sondage : assez vif pour un appui bref. */
const POLL_MS = 25;
/** La configuration relue au plus souvent : cabinet.json ne change pas en partie. */
const CONFIG_TTL_MS = 2000;

export interface NightButtonOptions {
  /** Boutons de la configuration branchée (relus de temps en temps). */
  buttons(): CabinetButtons | undefined;
  /** Un appui : le mode nuit bascule. */
  press(): void;
}

export interface NightButton {
  /** Hors écran : un appui ou un relâchement arrivé à une fenêtre du menu (autopilote). */
  windowInput(input: Input): void;
  stop(): void;
}

export function startNightButton(opts: NightButtonOptions): NightButton {
  let cached: { at: number; code: string | undefined } | undefined;
  const windowHeld = new Set<string>();
  let wasHeld = false;

  function code(): string | undefined {
    const now = Date.now();
    if (!cached || now - cached.at > CONFIG_TTL_MS) cached = { at: now, code: buttonKeys(opts.buttons()).nightMode };
    return cached.code;
  }

  function held(): boolean {
    const c = code();
    if (!c) return false;
    if (c.startsWith('SDLJoy_')) return joystickButtonsHeld().includes(c);
    if (OFFSCREEN) return windowHeld.has(c);
    const vk = windowsVk(c);
    if (vk === undefined) return false;
    try {
      return keysDown([vk]).includes(vk);
    } catch {
      return false; // API de Windows indisponible : seuls les joysticks comptent
    }
  }

  function poll(): void {
    const now = held();
    if (now && !wasHeld) opts.press();
    wasHeld = now;
  }

  const stopWatch = watchJoystickButtons(() => poll());
  const timer = setInterval(poll, POLL_MS);
  timer.unref();

  return {
    windowInput(input) {
      if (!OFFSCREEN) return;
      if (input.type === 'keyDown') windowHeld.add(input.code);
      else if (input.type === 'keyUp') windowHeld.delete(input.code);
      poll();
    },
    stop() {
      clearInterval(timer);
      stopWatch();
    },
  };
}
