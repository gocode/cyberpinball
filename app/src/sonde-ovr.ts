// Sonde LibOVR (packages/casque-vr/src/sonde-ovr.cpp, 13 novembre 2026) : un client invisible du runtime de Meta,
// dans un processus à part, qui écrit au journal ce que Link lui donne (limite du Quest, tête, manettes, boutons
// bruts), au menu comme pendant une partie de VPX. Elle ne change aucun comportement : elle mesure, pour décider
// d'un ancrage sur la limite et d'une lecture des manettes sans le regard d'OpenXR. Seulement avec le runtime de
// Meta (la DLL LibOVRRT64_1.dll à côté de son runtime OpenXR) et la réalité virtuelle activée.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ovrRuntimeDlls } from '@cyberpinball/core';
import { openXrActiveRuntime } from '@cyberpinball/win-displays';

const EXE = 'cyberpinball-sonde-ovr.exe';

/** La sonde, fabriquée avec l'application ou construite en développement. */
export function ovrProbeExe(appDir: string): string | undefined {
  return [path.join(appDir, 'natif', EXE), path.join(appDir, '..', 'build', 'casque-vr', 'Release', EXE), path.join(appDir, '..', '..', 'build', 'casque-vr', 'Release', EXE)].find((f) => fs.existsSync(f));
}

/** La DLL de LibOVR du runtime OpenXR actif, si c'est celui de Meta : la première des candidates présente. */
export function activeOvrDll(manifest = openXrActiveRuntime()): string | undefined {
  if (!manifest) return undefined;
  let text: string;
  try {
    text = fs.readFileSync(manifest, 'utf8');
  } catch {
    return undefined;
  }
  return ovrRuntimeDlls(manifest, text).find((dll) => fs.existsSync(dll));
}

/** Les points d'une ligne « ovr points n=… x,z … » (contour extérieur de la limite, au sol, mètres). */
export function parseOvrPoints(line: string): [number, number][] {
  return line
    .split(' ')
    .slice(3)
    .map((p) => p.split(',').map(Number) as [number, number])
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
}

/** Un saut de l'espace de suivi mesuré par la sonde : la transformation, l'intervalle des deux relevés, la tête après. */
export interface OvrJump {
  angle: number;
  tx: number;
  tz: number;
  dy: number;
  dtMs: number;
  headAfter: { x: number; z: number };
}

/**
 * Un saut de l'espace de suivi mesuré dans le flux de la tête (« ovr saut angle=… deplacement=tx,tz sol=… … dt=…
 * … a=x,y,z,lacet ») : la transformation p' = R(angle) p + t, à appliquer à la place calée (movePlace, arbitrateJump).
 */
export function parseOvrJump(line: string): OvrJump | undefined {
  const m = /^ovr saut angle=(-?[\d.]+) deplacement=(-?[\d.]+),(-?[\d.]+) sol=(-?[\d.]+) .* dt=([\d.]+) .* a=(-?[\d.]+),-?[\d.]+,(-?[\d.]+),/.exec(line);
  if (!m) return undefined;
  const [angle, tx, tz, dy, dtMs, hx, hz] = m.slice(1).map(Number) as [number, number, number, number, number, number, number];
  return [angle, tx, tz, dy, dtMs, hx, hz].every(Number.isFinite) ? { angle, tx, tz, dy, dtMs, headAfter: { x: hx, z: hz } } : undefined;
}

export class OvrProbe {
  private child: ChildProcessWithoutNullStreams | undefined;
  private wanted = false;
  private restarts = 0;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly opts: { appDir: string; log(line: string): void; onContour?(points: [number, number][]): void; onJump?(jump: OvrJump): void }) {}

  /** Lancée tant que `on` (réalité virtuelle activée) ; relancée si elle s'arrête, trois fois au plus. */
  set(on: boolean): void {
    this.wanted = on;
    if (on) this.start();
    else this.stop();
  }

  private start(): void {
    if (this.child || !this.wanted) return;
    const exe = ovrProbeExe(this.opts.appDir);
    const dll = activeOvrDll();
    if (!exe || !dll) {
      this.opts.log(`Casque, sonde LibOVR : pas lancée (${!exe ? 'sonde absente de l’application' : 'runtime OpenXR actif sans LibOVR de Meta'}).`); // i18n-ignore : journal
      return;
    }
    const child = spawn(exe, ['--ovr', dll], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        // Le contour complet : pour l'ancrage (frontend.ts), pas pour le journal (406 points à chaque changement).
        if (line.startsWith('ovr points ')) {
          this.opts.onContour?.(parseOvrPoints(line));
          continue;
        }
        if (line.startsWith('ovr ')) this.opts.log(`Casque, sonde LibOVR : ${line.slice(4)}`); // i18n-ignore : journal
        // Un saut accepté par la sonde (garde-fous passés) : au menu, la borne reposée (frontend.ts, headsetJump).
        const jump = line.startsWith('ovr saut ') ? parseOvrJump(line) : undefined;
        if (jump) this.opts.onJump?.(jump);
      }
    });
    child.stderr.on('data', () => undefined);
    child.on('error', (error) => this.opts.log(`Casque, sonde LibOVR : pas lancée (${error.message}).`)); // i18n-ignore : journal
    child.on('exit', (code) => {
      if (this.child === child) this.child = undefined;
      if (!this.wanted) return;
      this.opts.log(`Casque, sonde LibOVR : arrêtée (code ${code ?? '?'})${this.restarts < 3 ? ', relancée dans 30 s' : ''}.`); // i18n-ignore : journal
      if (this.restarts++ < 3) this.timer = setTimeout(() => this.start(), 30_000);
    });
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const child = this.child;
    this.child = undefined;
    if (!child) return;
    try {
      child.stdin.write('fin\n');
      child.stdin.end();
    } catch {
      // Déjà partie.
    }
    setTimeout(() => {
      if (child.exitCode === null) child.kill();
    }, 2000).unref();
  }
}
