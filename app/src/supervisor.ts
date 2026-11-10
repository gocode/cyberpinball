// Surveillant de la borne dédiée sans Shell Launcher (windowssettings.ts, façon « shell ») :
// Windows lance « CyberPinball.exe --borne-compte » comme shell du compte ; ce processus
// n'ouvre aucune fenêtre, lance Cyber Pinball avec l'option de la borne dédiée et fait ce que
// ferait Shell Launcher (dedicated-session.ts) :
// - Cyber Pinball se ferme ou plante : relancé aussitôt ;
// - il sort avec HANDOVER_EXIT_CODE (mise à jour) : le surveillant s'arrête, l'installeur
//   relance lui-même Cyber Pinball ;
// - il plante en boucle (SUPERVISOR_LOOP_LIMIT sorties en SUPERVISOR_LOOP_MS) : le surveillant
//   ouvre l'Explorateur et s'arrête, pour ne jamais laisser un écran noir sans issue ;
// - il est figé (processus principal bloqué : plus aucun pouls depuis PULSE_STALE_MS) : il est
//   arrêté puis relancé, au lieu d'attendre le gestionnaire des tâches (PinCab, 10/11/2026).

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { DEDICATED_FLAG, PULSE_ENV, PULSE_EVERY_MS, pulseStale, SUPERVISOR_FLAG, supervisorMarkerFile, supervisorVerdict } from '@cyberpinball/core';
import { journalIncident } from './uncaught';

/** Lecture du pouls de Cyber Pinball par le surveillant. */
const PULSE_CHECK_MS = 5000;

/**
 * Lancé par le surveillant : le pouls, écrit toutes les PULSE_EVERY_MS par la boucle du processus
 * principal. Figée, elle n'écrit plus, et le surveillant le voit.
 */
export function beatPulse(): void {
  const file = process.env[PULSE_ENV];
  if (!file) return;
  const beat = () => {
    try {
      fs.writeFileSync(file, new Date().toISOString(), 'utf8');
    } catch {
      // Disque plein : le surveillant le prendra pour un arrêt, et relancera.
    }
  };
  beat();
  setInterval(beat, PULSE_EVERY_MS).unref();
}

/** Ce processus est le surveillant : main.ts ne démarre alors rien d'autre. */
export function superviseCabinet(dataDir: string): boolean {
  if (!process.argv.includes(SUPERVISOR_FLAG)) return false;
  const args = process.argv.slice(1).filter((a) => a !== SUPERVISOR_FLAG);
  const exits: number[] = [];
  fs.mkdirSync(path.dirname(supervisorMarkerFile(dataDir)), { recursive: true });
  fs.writeFileSync(supervisorMarkerFile(dataDir), JSON.stringify({ at: new Date().toISOString(), pid: process.pid }) + '\n', 'utf8');
  const pulse = path.join(path.dirname(supervisorMarkerFile(dataDir)), 'pouls.txt');
  const launch = () => {
    fs.rmSync(pulse, { force: true });
    const startedAt = Date.now();
    const child = spawn(process.execPath, [...args, DEDICATED_FLAG], { stdio: 'ignore', windowsHide: true, env: { ...process.env, [PULSE_ENV]: pulse } });
    const watch = setInterval(() => {
      let beat: number | undefined;
      try {
        beat = fs.statSync(pulse).mtimeMs;
      } catch {
        beat = undefined;
      }
      if (!pulseStale(beat, startedAt, Date.now())) return;
      clearInterval(watch);
      journalIncident(`Surveillant : Cyber Pinball (pid ${child.pid}) ne répond plus, arrêté puis relancé`); // i18n-ignore : journal
      if (child.pid) spawn('taskkill.exe', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true });
    }, PULSE_CHECK_MS);
    child.on('exit', () => clearInterval(watch));
    console.log(`Surveillant : Cyber Pinball lancé (pid ${child.pid}).`);
    child.on('error', (error) => console.log(`Surveillant : lancement impossible (${error.message}).`));
    child.on('exit', (code) => {
      exits.push(Date.now());
      const verdict = supervisorVerdict(code, exits, Date.now());
      console.log(`Surveillant : Cyber Pinball sorti (code ${code}) : ${verdict}.`);
      if (verdict === 'relaunch') return void setTimeout(launch, 300);
      if (verdict === 'explorer') {
        console.log('Surveillant : Cyber Pinball plante en boucle, l’Explorateur est ouvert pour reprendre la main.');
        spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe'), [], { detached: true, stdio: 'ignore' }).unref(); // fenêtre voulue
      }
      app.exit(0);
    });
  };
  // Aucune fenêtre ici : Electron resterait ouvert sans elles, il ne sort que par app.exit.
  app.whenReady().then(launch);
  return true;
}

