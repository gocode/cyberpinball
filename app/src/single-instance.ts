// Cyber Pinball ne tourne qu'une fois par profil (packages/core/src/lifetime.ts) : un second
// lancement ramène l'instance ouverte au premier plan et se ferme, au lieu d'ouvrir un second
// menu par-dessus (deux bornes du même nom sur le réseau des amis, écrans et boutons disputés).
// Le verrou est celui d'Electron, lié au profil de Chromium : chaque bac à sable d'essai
// (sandbox-profile.ts) a le sien.

import { app } from 'electron';
import { SECOND_LAUNCH_DEBOUNCE_MS, SINGLE_INSTANCE_RETRY_MS, singleInstanceStep } from '@cyberpinball/core';

let onSecondLaunch: (() => void) | undefined;
let lastSignal = 0;

/** Ce que fait l'instance ouverte quand Cyber Pinball est relancé (menu : retour du mode bureau, premier plan). */
export function handleSecondLaunch(handler: () => void): void {
  onSecondLaunch = handler;
}

/**
 * Prend le verrou d'instance unique. Résout true : ce processus démarre ; false : une autre
 * instance est ouverte, elle a été prévenue, ce processus doit sortir sans rien ouvrir.
 * `relaying` : nouveau processus d'une relève, qui démarre tout de suite et prend le verrou
 * dès que l'ancien est sorti. `ignore` : vrai pendant une relève ou une fermeture de cette instance.
 */
export function holdSingleInstance(opts: { relaying: boolean; ignore: () => boolean }): Promise<boolean> {
  app.on('second-instance', () => {
    if (opts.ignore()) return;
    const now = Date.now();
    if (now - lastSignal < SECOND_LAUNCH_DEBOUNCE_MS) return;
    lastSignal = now;
    console.log('Instance unique : Cyber Pinball relancé alors qu’il est déjà ouvert ; l’instance ouverte revient au premier plan.');
    onSecondLaunch?.();
  });
  if (app.requestSingleInstanceLock()) return Promise.resolve(true);
  const started = Date.now();
  return new Promise<boolean>((resolve) => {
    const step = () => {
      const action = singleInstanceStep({ relaying: opts.relaying, waited: Date.now() - started });
      if (action === 'give-up') {
        console.log('Instance unique : Cyber Pinball est déjà ouvert ; ce lancement le ramène au premier plan et se ferme.');
        return resolve(false);
      }
      if (action === 'start-and-retry') resolve(true);
      setTimeout(() => {
        if (app.requestSingleInstanceLock()) {
          if (opts.relaying) console.log(`Instance unique : verrou repris de l’ancien processus après ${Date.now() - started} ms.`);
          else console.log(`Instance unique : l’instance précédente s’est fermée, ce lancement démarre (${Date.now() - started} ms d’attente).`);
          return resolve(true);
        }
        step();
      }, SINGLE_INSTANCE_RETRY_MS);
    };
    step();
  });
}
