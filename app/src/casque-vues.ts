// Le menu dessiné pour le casque (casque.ts) : une fenêtre de Cyber Pinball rendue hors écran par
// écran de la borne, à la définition de l'écran, la même page que sur les écrans (frontend.html),
// le playfield en disposition de borne (portrait), quel que soit l'écran du PC. Leurs images
// (textures partagées du GPU, webPreferences.offscreen.useSharedTexture) vont au compagnon sans
// passer par le processeur ; les écrans du PC gardent leur menu en paysage.
//
// Elles ne dessinent que quand le casque est porté (setPainting) : retiré, ou le menu de Meta
// ouvert, rien n'est rendu pour lui. Elles n'entendent rien (son coupé), ne reçoivent aucun bouton,
// et ce qu'elles envoient d'elles-mêmes (mesures, erreurs de média, état du son) est ignoré par le
// processus principal (isHeadsetView) : les écrans restent la référence.

import * as path from 'node:path';
import type { BrowserWindow, OffscreenSharedTexture, WebContents } from 'electron';
import type { Rect, RoleId, Rotation } from '@cyberpinball/core';
import { createWindow, primaryWorkArea } from './offscreen';

/** Une page du menu : l'écran d'un rôle, et les rôles qui y ont leur zone. */
export interface HeadsetPage {
  role: RoleId;
  /** L'écran entier, en pixels physiques du bureau. */
  bounds: Rect;
  parts: unknown[];
  playfield?: unknown;
}

export interface HeadsetViewsOptions {
  appDir: string;
  /** Rotation de la mise en page du playfield dans le casque (portrait). */
  playfieldRotation: Rotation;
  /** Une image d'une page : à transmettre au compagnon, qui la rendra par release(). */
  onTexture(surface: RoleId, texture: OffscreenSharedTexture): void;
  log(line: string): void;
}

const views = new Map<RoleId, BrowserWindow>();
const senders = new Set<number>();

/** La page vient d'une fenêtre du casque : ses mesures et ses comptes rendus ne valent pas pour les écrans. */
export function isHeadsetView(sender: WebContents): boolean {
  return senders.has(sender.id);
}

export function headsetViews(): ReadonlyMap<RoleId, BrowserWindow> {
  return views;
}

/**
 * Taille de la fenêtre rendue pour le casque : Windows ramène une fenêtre, même cachée, à la zone de
 * travail de l'écran principal (1920 × 1032 sur un écran de 1080 avec sa barre des tâches, mesuré) ;
 * la page garde les proportions de son écran, et un zoom lui donne la mise en page de l'écran réel.
 * Une image de 1835 × 1032 pour un playfield 4K reste plus fine que ce que le casque en montre.
 */
export function headsetViewSize(bounds: Rect, work: { width: number; height: number }): { width: number; height: number; zoom: number } {
  const zoom = Math.min(1, work.width / bounds.width, work.height / bounds.height);
  return { width: Math.max(1, Math.floor(bounds.width * zoom)), height: Math.max(1, Math.floor(bounds.height * zoom)), zoom };
}

/** Ouvre une fenêtre hors écran par page ; celles d'avant sont fermées. */
export function openHeadsetViews(pages: readonly HeadsetPage[], opts: HeadsetViewsOptions): void {
  closeHeadsetViews();
  const work = primaryWorkArea();
  for (const page of pages) {
    const size = headsetViewSize(page.bounds, work);
    const win = createWindow({
      show: false,
      frame: false,
      skipTaskbar: true,
      focusable: false,
      width: size.width,
      height: size.height,
      useContentSize: true,
      backgroundColor: '#030807',
      webPreferences: {
        preload: path.join(opts.appDir, 'dist', 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        autoplayPolicy: 'no-user-gesture-required',
        offscreen: { useSharedTexture: true },
        zoomFactor: size.zoom,
      },
    });
    win.webContents.setAudioMuted(true);
    win.webContents.setFrameRate(60);
    // Rien n'est dessiné tant que le casque n'est pas porté.
    win.webContents.stopPainting();
    senders.add(win.webContents.id);
    win.webContents.on('paint', (event) => {
      const texture = (event as unknown as { texture?: OffscreenSharedTexture }).texture;
      if (texture) opts.onTexture(page.role, texture);
    });
    const turn = page.role === 'playfield' ? opts.playfieldRotation : 0;
    void win.loadFile(path.join(opts.appDir, 'renderer', 'frontend.html'), {
      query: { role: page.role, rotation: String(turn), zones: JSON.stringify(page.parts), casque: '1', ...(page.playfield ? { playfield: JSON.stringify(page.playfield) } : {}) },
    });
    views.set(page.role, win);
  }
  opts.log(`Casque : ${pages.length} écran(s) rendu(s) pour le casque, hors écran (${pages.map((p) => `${p.role} ${p.bounds.width}×${p.bounds.height}`).join(', ')}).`); // i18n-ignore : journal
}

export function closeHeadsetViews(): void {
  for (const win of views.values()) {
    if (win.isDestroyed()) continue;
    senders.delete(win.webContents.id);
    win.destroy();
  }
  views.clear();
  senders.clear();
}

/** Casque porté : les pages dessinent ; retiré : plus aucun rendu pour lui. */
export function setHeadsetPainting(on: boolean): void {
  for (const win of views.values()) {
    if (win.isDestroyed()) continue;
    if (on) {
      win.webContents.startPainting();
      win.webContents.invalidate();
    } else win.webContents.stopPainting();
  }
}

/** L'état du menu, comme aux écrans (viewFor). */
export function sendToHeadsetViews(view: (role: RoleId) => unknown): void {
  for (const [role, win] of views) {
    if (!win.isDestroyed()) win.webContents.send('state', view(role));
  }
}
