// Bouton du mode nuit (buttons.ts, `nightMode`, bouton avancé) : un appui bascule le mode, au front-end
// comme pendant une partie. Lu comme les boutons de volume (cabinet-volume.ts), quelle que soit la
// fenêtre au premier plan (VPX en partie) : touches du clavier par GetAsyncKeyState, boutons du joystick
// par le sondage de SDL. Seul le front d'appui compte : un bouton tenu ne bascule qu'une fois.
//
// Hors écran (essais sans opérateur), GetAsyncKeyState ne voit rien : les appuis arrivent par les
// fenêtres du menu (autopilote), comme pour le volume.

import { buttonKeys, windowsVk, type CabinetButtons, type NavigationButtons } from '@cyberpinball/core';
import { keysDown } from '@cyberpinball/win-displays';
import type { Input } from 'electron';
import { joystickButtonsHeld, watchJoystickButtons } from './joystick-input';
import { OFFSCREEN } from './offscreen';

/** Sondage : assez vif pour un appui bref. */
const POLL_MS = 25;
/** La configuration relue au plus souvent : cabinet.json ne change pas en partie. */
const CONFIG_TTL_MS = 2000;

export interface NightButtonOptions {
  /** Boutons du jeu et de l'interface de la configuration branchée (relus de temps en temps). */
  buttons(): { buttons?: CabinetButtons; navigation?: NavigationButtons } | undefined;
  /** Un appui : le mode nuit bascule. */
  press(): void;
}

export interface NightButton {
  /** Hors écran : un appui ou un relâchement arrivé à une fenêtre du menu (autopilote). */
  windowInput(input: Input): void;
  stop(): void;
}

export function startNightButton(opts: NightButtonOptions): NightButton {
  let cached: { at: number; codes: string[] } | undefined;
  const windowHeld = new Set<string>();
  let wasHeld = false;

  /** Le bouton avancé des boutons du jeu et le bouton de l'interface : l'un ou l'autre bascule le mode. */
  function codes(): string[] {
    const now = Date.now();
    if (!cached || now - cached.at > CONFIG_TTL_MS) {
      const source = opts.buttons();
      const list = [buttonKeys(source?.buttons).nightMode, source?.navigation?.nightMode].filter((c): c is string => Boolean(c));
      cached = { at: now, codes: [...new Set(list)] };
    }
    return cached.codes;
  }

  function codeHeld(c: string): boolean {
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

  function held(): boolean {
    return codes().some(codeHeld);
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
