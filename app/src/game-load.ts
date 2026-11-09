// Charge du PC pendant une partie (packages/core/src/game-load.ts) : toutes les SAMPLE_MS, ce que
// prennent les processus de Cyber Pinball (app.getAppMetrics : pourcentage d'un cœur depuis l'appel
// précédent) et VPX (temps de processeur lu par GetProcessTimes). Rien d'autre n'est lancé : aucun
// programme de mesure, aucune page réveillée ; un relevé coûte moins d'une milliseconde.

import { app } from 'electron';
import { cpuPercent, gameLoadReport, loadSample, type LoadSample } from '@cyberpinball/core';
import { processCpuMs } from '@cyberpinball/win-displays';

const SAMPLE_MS = 5_000;

export interface GameLoadWatch {
  /** Fin de la partie : les relevés s'arrêtent ; rend la ligne du journal (rien sans relevé). */
  stop(where: 'casque' | 'ecrans'): string | undefined;
}

export function watchGameLoad(vpxPid: number | undefined): GameLoadWatch {
  const samples: LoadSample[] = [];
  // Le premier appel remet à zéro le compteur de chaque processus.
  app.getAppMetrics();
  const readVpx = () => {
    if (vpxPid === undefined) return undefined;
    try {
      return processCpuMs(vpxPid);
    } catch {
      return undefined;
    }
  };
  let last = { at: Date.now(), vpx: readVpx() };
  const timer = setInterval(() => {
    const now = { at: Date.now(), vpx: readVpx() };
    const vpx = last.vpx !== undefined && now.vpx !== undefined ? cpuPercent(last.vpx, now.vpx, now.at - last.at) : undefined;
    samples.push(loadSample(app.getAppMetrics().map((m) => ({ type: m.type, cpu: m.cpu.percentCPUUsage })), vpx));
    last = now;
  }, SAMPLE_MS);
  timer.unref();
  return {
    stop(where) {
      clearInterval(timer);
      return gameLoadReport(samples, where, SAMPLE_MS);
    },
  };
}
