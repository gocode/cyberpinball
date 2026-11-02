// Surveillant de la borne dédiée sans Shell Launcher (windowssettings.ts, façon « shell ») :
// Windows lance « CyberPinball.exe --borne-compte » comme shell du compte ; ce processus
// n'ouvre aucune fenêtre, lance Cyber Pinball avec l'option de la borne dédiée et fait ce que
// ferait Shell Launcher (dedicated-session.ts) :
// - Cyber Pinball se ferme ou plante : relancé aussitôt ;
// - il sort avec HANDOVER_EXIT_CODE (mise à jour) : le surveillant s'arrête, l'installeur
//   relance lui-même Cyber Pinball ;
// - il plante en boucle (SUPERVISOR_LOOP_LIMIT sorties en SUPERVISOR_LOOP_MS) : le surveillant
//   ouvre l'Explorateur et s'arrête, pour ne jamais laisser un écran noir sans issue.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { DEDICATED_FLAG, SUPERVISOR_FLAG, supervisorMarkerFile, supervisorVerdict } from '@cyberpinball/core';

/** Ce processus est le surveillant : main.ts ne démarre alors rien d'autre. */
export function superviseCabinet(dataDir: string): boolean {
  if (!process.argv.includes(SUPERVISOR_FLAG)) return false;
  const args = process.argv.slice(1).filter((a) => a !== SUPERVISOR_FLAG);
  const exits: number[] = [];
  fs.mkdirSync(path.dirname(supervisorMarkerFile(dataDir)), { recursive: true });
  fs.writeFileSync(supervisorMarkerFile(dataDir), JSON.stringify({ at: new Date().toISOString(), pid: process.pid }) + '\n', 'utf8');
  const launch = () => {
    const child = spawn(process.execPath, [...args, DEDICATED_FLAG], { stdio: 'ignore', windowsHide: true });
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

