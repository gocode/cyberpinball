// Le menu dans le casque (packages/core/src/casque.ts) : quand la réalité virtuelle est activée et
// le casque prêt, le compagnon natif (packages/casque-vr) montre les écrans de la borne dans le
// casque, posés en borne. Cyber Pinball garde le premier plan : on navigue avec les boutons de la
// borne comme d'habitude. Avant une partie, le compagnon rend le casque à VPX (fin propre de sa
// session OpenXR) ; il le reprend au retour au menu.
//
// Le compagnon : <application>\natif\cyberpinball-casque.exe une fois l'application fabriquée,
// build\casque-vr\Release\ en développement (npm run casque-vr). Le chargeur OpenXR est celui de la
// copie de VPX. Casque absent (Link pas lancé) : nouvel essai toutes les 15 s.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { headsetPanels, headsetProtocol, headsetScene, sceneProtocol, type HeadsetMenuState, type HeadsetPanel, type HeadsetSource, type Rotation } from '@cyberpinball/core';
import { OFFSCREEN } from './offscreen';

const EXE = 'cyberpinball-casque.exe';
const RETRY_MS = 15_000;
const STOP_TIMEOUT_MS = 4_000;
/** Messages du compagnon gardés dans le journal (packages/casque-vr/src/casque.cpp). */
const PROTOCOL = /^(pret|casque-absent|erreur|centre|image|scene|fini)\b/;

/** Le compagnon, s'il est là : fabriqué avec l'application, ou construit en développement. */
export function headsetExe(appDir: string): string | undefined {
  const candidates = [
    path.join(appDir, 'natif', EXE),
    path.join(appDir, '..', 'build', 'casque-vr', 'Release', EXE),
    path.join(appDir, '..', '..', 'build', 'casque-vr', 'Release', EXE),
  ];
  return candidates.find((f) => fs.existsSync(f));
}

export interface HeadsetMenuOptions {
  appDir: string;
  /** Doit-il tourner maintenant ? (réalité virtuelle activée, runtime présent, pas de partie en cours) */
  wanted(): boolean;
  /** Chargeur OpenXR de la copie de VPX. */
  loader(): string | undefined;
  /** Ce qu'il faut montrer : chaque rôle, son rectangle et la taille de son écran. */
  sources(): HeadsetSource[];
  playfieldRotation(): Rotation;
  /** Teinte de la table choisie (#rrggbb), pour le halo des cadres ; undefined : la sarcelle. */
  tint(): string | undefined;
  log(line: string): void;
}

export class HeadsetMenu {
  private child: ChildProcessWithoutNullStreams | undefined;
  private retryAt = 0;
  private timer: NodeJS.Timeout | undefined;
  /** Panneaux et teinte de la scène envoyée au compagnon en cours. */
  private panels: HeadsetPanel[] = [];
  private sentTint: string | undefined;
  /** Pour le détail de l'entrée « Réalité virtuelle » : montré, en attente du casque, ou compagnon absent. */
  state: HeadsetMenuState = 'waiting';

  constructor(private readonly opts: HeadsetMenuOptions) {}

  /** Vérifie toutes les 2 s s'il faut le lancer ou l'arrêter. */
  watch(): void {
    if (OFFSCREEN || this.timer) return;
    this.timer = setInterval(() => this.check(), 2_000);
    this.check();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    void this.stop();
  }

  get running(): boolean {
    return Boolean(this.child);
  }

  check(): void {
    if (OFFSCREEN) return;
    if (!this.opts.wanted()) {
      if (this.child) void this.stop();
      return;
    }
    if (this.child || Date.now() < this.retryAt) return;
    this.start();
  }

  recenter(): void {
    this.child?.stdin.write('recentrer\n');
  }

  /** La table choisie a changé de teinte : la scène est renvoyée avec le nouveau halo (borne en volume, casque-scene.ts). */
  tintChanged(): void {
    const tint = this.opts.tint();
    if (!this.child || tint === this.sentTint) return;
    this.sendScene(this.child, tint);
  }

  private sendScene(child: ChildProcessWithoutNullStreams, tint: string | undefined): void {
    this.sentTint = tint;
    try {
      for (const line of sceneProtocol(headsetScene(this.panels, tint))) child.stdin.write(`${line}\n`);
    } catch {
      // Compagnon parti entre-temps : la scène suivra au prochain lancement.
    }
  }

  private start(): void {
    const exe = headsetExe(this.opts.appDir);
    const loader = this.opts.loader();
    if (!exe || !loader) {
      if (this.state !== 'missing') this.opts.log(`Casque : ${!exe ? 'compagnon absent (npm run casque-vr)' : 'chargeur OpenXR de VPX introuvable'}.`); // i18n-ignore : journal
      this.state = 'missing';
      this.retryAt = Date.now() + RETRY_MS;
      return;
    }
    const panels = headsetPanels(this.opts.sources(), this.opts.playfieldRotation());
    if (!panels.length) return;
    const child = spawn(exe, ['--chargeur', loader], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    this.state = 'waiting';
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        // Seulement les messages du compagnon : le runtime de Meta écrit aussi sur sa sortie, des
        // dizaines de lignes à chaque session (RipcClient, RuntimeIPC…).
        if (!PROTOCOL.test(line)) continue;
        if (line.startsWith('pret')) this.state = 'shown';
        if (line.startsWith('casque-absent')) this.state = 'waiting';
        this.opts.log(`Casque : ${line}`); // i18n-ignore : journal
      }
    });
    child.stderr.on('data', () => undefined);
    child.on('error', (error) => this.opts.log(`Casque : lancement impossible (${error.message}).`)); // i18n-ignore : journal
    child.on('exit', (code) => {
      if (this.child === child) this.child = undefined;
      if (this.state === 'shown') this.state = 'waiting';
      // Casque absent ou session perdue : nouvel essai plus tard ; arrêt demandé : rien.
      if (code !== 0) this.retryAt = Date.now() + RETRY_MS;
    });
    this.panels = panels;
    for (const line of headsetProtocol(panels).filter((l) => l !== 'fin')) child.stdin.write(`${line}\n`);
    this.sendScene(child, this.opts.tint());
    child.stdin.write('fin\n');
    this.opts.log(`Casque : compagnon lancé, ${panels.map((p) => `${p.role} ${p.width.toFixed(2)}×${p.height.toFixed(2)} m`).join(', ')}.`); // i18n-ignore : journal
  }

  /** Rend le casque : fin propre de la session OpenXR, ou arrêt forcé après 4 s. */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = undefined;
    await new Promise<void>((resolve) => {
      const kill = setTimeout(() => {
        child.kill();
        resolve();
      }, STOP_TIMEOUT_MS);
      child.once('exit', () => {
        clearTimeout(kill);
        resolve();
      });
      try {
        child.stdin.end('quitter\n');
      } catch {
        child.kill();
      }
    });
  }
}
