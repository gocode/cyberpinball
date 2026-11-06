// Fenêtre du pointeur du téléphone (phone-remote.ts) : transparente, sans focus ni bouton dans la
// barre des tâches, que les clics et la souris de la borne traversent, posée sur tout le contenu de
// la fenêtre « Récupérer » (overlayContent) et rattachée à elle (au-dessus d'elle, réduite et fermée
// avec elle). Montrée dès son chargement, vide : le pointeur n'y paraît que pendant qu'un téléphone
// pilote. Elle dessine le pointeur à chaque image de l'écran (app/renderer/remote-pointer.js) : une
// petite vue déplacée à chaque geste suivait les paquets du Wi-Fi par à-coups (essai réel du
// 06/11/2026). Jamais focalisée : elle ne volerait pas le clavier à la page (buttons.test.ts).

import * as path from 'node:path';
import type { BrowserWindow } from 'electron';
import { overlayContent } from './cover-display';
import { createWindow } from './offscreen';

/** Crée la fenêtre du pointeur sur `parent` ; `loaded` une fois sa page prête (et la fenêtre montrée). */
export function pointerWindow(parent: BrowserWindow, rendererDir: string, loaded: (win: BrowserWindow) => void): BrowserWindow {
  const win = createWindow({
    parent,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'remote-pointer-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setIgnoreMouseEvents(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.webContents.setAudioMuted(true);
  overlayContent(win, parent);
  win.webContents.once('did-finish-load', () => {
    if (win.isDestroyed()) return;
    win.showInactive();
    loaded(win);
  });
  void win.loadFile(path.join(rendererDir, 'remote-pointer.html')).catch(() => undefined);
  return win;
}
