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
 * … a=x,y,z,lacet ») : la transformation p' = R(angle) p + t, à appliquer à la place calée (movePlace).
 */
export function parseOvrJump(line: string): OvrJump | undefined {
  const m = /^ovr saut angle=(-?[\d.]+) deplacement=(-?[\d.]+),(-?[\d.]+) sol=(-?[\d.]+) .* dt=([\d.]+) .* a=(-?[\d.]+),-?[\d.]+,(-?[\d.]+),(-?[\d.]+)/.exec(line);
  if (!m) return undefined;
  const [angle, tx, tz, dy, dtMs, hx, hz, hyaw] = m.slice(1).map(Number) as [number, number, number, number, number, number, number, number];
  if (![angle, tx, tz, dy, dtMs, hx, hz, hyaw].every(Number.isFinite)) return undefined;
  // Par sécurité, la signature de la remise d'origine aussi ici : la tête arrivée à l'origine même (la sonde la vérifie
  // déjà à 2 cm et 2°). Une sonde plus ancienne, ou une ligne d'un autre bond, n'est jamais appliquée.
  if (Math.hypot(hx, hz) > JUMP_ARRIVAL_MAX_M || Math.abs(hyaw) > JUMP_ARRIVAL_MAX_RAD) return undefined;
  return { angle, tx, tz, dy, dtMs, headAfter: { x: hx, z: hz } };
}

/** La tête d'arrivée d'un saut accepté : à moins de 3 cm et 3° de l'origine (relevés réels : 0,7 cm et 0,2° au plus). */
export const JUMP_ARRIVAL_MAX_M = 0.03;
export const JUMP_ARRIVAL_MAX_RAD = (3 * Math.PI) / 180;

/** « ovr pouls casque=0|1 porte=0|1 » : la sonde vit, et a le casque ou non. */
export function parseOvrPulse(line: string): { present: boolean; mounted: boolean } | undefined {
  const m = /^ovr pouls casque=([01]) porte=([01])/.exec(line);
  return m ? { present: m[1] === '1', mounted: m[2] === '1' } : undefined;
}

/** Sans pouls depuis ce délai (ms), la sonde est muette. */
export const PROBE_SILENT_MS = 3000;
/** Compagnon prêt et sonde sans le casque depuis ce délai (ms) : la sonde est relancée (garde de l'application). */
export const PROBE_GUARD_MS = 5000;
/** Au plus une relance par la garde dans ce délai (ms). */
export const PROBE_GUARD_EVERY_MS = 30_000;

export class OvrProbe {
  private child: ChildProcessWithoutNullStreams | undefined;
  private wanted = false;
  private restarts = 0;
  private timer: NodeJS.Timeout | undefined;
  private guard: NodeJS.Timeout | undefined;
  private pulse: { at: number; present: boolean } | undefined;
  private startedAt = 0;
  private following = false;
  private lostSince: number | undefined;
  private guardAt = -Infinity;
  private unavailable = false;

  constructor(
    private readonly opts: {
      appDir: string;
      log(line: string): void;
      onContour?(points: [number, number][]): void;
      onJump?(jump: OvrJump): void;
      /** La sonde suit le casque, ou plus (muette, arrêtée, sans casque) : à chaque changement, avec la raison. */
      onTracking?(on: boolean, why: string): void;
      /** Le compagnon a le casque (« pret ») : la garde relance une sonde qui ne le suit pas. */
      companionReady?(): boolean;
      /** Au banc : la sonde et la DLL de LibOVR (sinon celles de l'application et du runtime actif). */
      exe?: string;
      dll?: string;
      env?: NodeJS.ProcessEnv;
    },
  ) {}

  /** Une commande à la sonde (« contour » : redire le contour, même inchangé). */
  send(command: string): void {
    try {
      this.child?.stdin.write(`${command}\n`);
    } catch {
      // Sonde partie : rien à dire.
    }
  }

  /** La sonde vit (pouls récent) et voit le casque : les remises d'origine sont mesurées. */
  tracking(): boolean {
    return Boolean(this.child && this.pulse?.present && Date.now() - this.pulse.at < PROBE_SILENT_MS);
  }

  /** Vivante (pouls récent) mais sans le casque : Link coupé ou casque éteint, pour elle comme pour tous. */
  withoutHeadset(): boolean {
    return Boolean(this.child && this.pulse && !this.pulse.present && Date.now() - this.pulse.at < PROBE_SILENT_MS);
  }

  /** Pourquoi elle ne suit pas le casque (journal). */
  private lostWhy(): string {
    if (!this.child) return 'arrêtée'; // i18n-ignore : journal
    if (!this.pulse || Date.now() - this.pulse.at >= PROBE_SILENT_MS) return `muette depuis ${Math.round((Date.now() - (this.pulse?.at ?? this.startedAt)) / 1000)} s`; // i18n-ignore : journal
    return 'casque absent pour elle'; // i18n-ignore : journal
  }

  /** Lancée tant que `on` (réalité virtuelle activée) ; relancée si elle s'arrête, trois fois au plus. */
  set(on: boolean): void {
    this.wanted = on;
    if (on) {
      this.start();
      this.guard ??= setInterval(() => this.check(), 1000);
      return;
    }
    if (this.guard) clearInterval(this.guard);
    this.guard = undefined;
    this.stop();
    this.changed(false, 'réalité virtuelle désactivée'); // i18n-ignore : journal
  }

  /** Chaque seconde : le suivi dit quand il change ; la garde relance une sonde sans le casque, compagnon prêt. */
  check(): void {
    const on = this.tracking();
    this.changed(on, on ? '' : this.lostWhy());
    if (on || !this.wanted || this.unavailable || !this.opts.companionReady?.()) {
      this.lostSince = undefined;
      return;
    }
    const now = Date.now();
    this.lostSince ??= now;
    if (now - this.lostSince < PROBE_GUARD_MS || now - this.guardAt < PROBE_GUARD_EVERY_MS) return;
    this.guardAt = now;
    this.lostSince = undefined;
    this.opts.log(`Casque, sonde LibOVR : ${this.lostWhy()} alors que le compagnon a le casque ; relancée (aucun saut ne peut être mesuré sans elle).`); // i18n-ignore : journal
    this.restart();
  }

  private changed(on: boolean, why: string): void {
    if (on === this.following) return;
    this.following = on;
    this.opts.onTracking?.(on, why);
  }

  /** Arrêtée et relancée aussitôt (garde de l'application). */
  restart(): void {
    this.stop();
    this.restarts = 0;
    this.start();
  }

  private start(): void {
    if (this.child || !this.wanted) return;
    const exe = this.opts.exe ?? ovrProbeExe(this.opts.appDir);
    const dll = this.opts.dll ?? activeOvrDll();
    if (!exe || !dll) {
      this.unavailable = true;
      this.opts.log(`Casque, sonde LibOVR : pas lancée (${!exe ? 'sonde absente de l’application' : 'runtime OpenXR actif sans LibOVR de Meta'}).`); // i18n-ignore : journal
      return;
    }
    this.unavailable = false;
    const child = spawn(exe, ['--ovr', dll], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], ...(this.opts.env && { env: this.opts.env }) });
    this.child = child;
    this.pulse = undefined;
    this.startedAt = Date.now();
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        // Une sonde déjà remplacée (relance par la garde) : ses dernières lignes ne comptent plus.
        if (this.child !== child) continue;
        // Le contour complet : pour l'ancrage (frontend.ts), pas pour le journal (406 points à chaque changement).
        if (line.startsWith('ovr points ')) {
          this.opts.onContour?.(parseOvrPoints(line));
          continue;
        }
        // Le pouls, chaque seconde : pour la garde, pas pour le journal.
        const pulse = parseOvrPulse(line);
        if (pulse) {
          this.pulse = { at: Date.now(), present: pulse.present };
          if (pulse.present !== this.following) this.check();
          continue;
        }
        if (line.startsWith('ovr ')) this.opts.log(`Casque, sonde LibOVR : ${line.slice(4)}`); // i18n-ignore : journal
        // Un saut accepté par la sonde (garde-fous passés) : la borne reposée (frontend.ts, headsetJump).
        const jump = line.startsWith('ovr saut ') ? parseOvrJump(line) : undefined;
        if (jump) this.opts.onJump?.(jump);
      }
    });
    child.stderr.on('data', () => undefined);
    child.on('error', (error) => this.opts.log(`Casque, sonde LibOVR : pas lancée (${error.message}).`)); // i18n-ignore : journal
    child.on('exit', (code) => {
      // Une sonde remplacée (relance par la garde) : rien à dire ni à relancer.
      if (this.child !== child) return;
      this.child = undefined;
      this.pulse = undefined;
      this.check();
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
    this.pulse = undefined;
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
