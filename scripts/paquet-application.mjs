// Le paquet de l'application (build\app, puis release\CyberPinball-application.zip) : ce qui doit y
// être, et une seule fabrication à la fois.
//
// Le 13/11/2026, la préversion 0.1.13-essai.1 est partie sans son code (6,2 Mio au lieu de 17,8) :
// deux fabrications lancées dans le même dossier par deux sessions, la seconde a vidé build\ (début
// de scripts/fabriquer.mjs) pendant que la première le remplissait. Les bornes l'ont refusée
// (packages/core/src/update.ts, unpackAppPackage), mais rien ne l'avait arrêtée avant GitHub.
// Désormais : fabriquer.mjs prend un verrou, vérifie build\app avant d'en faire le paquet, et
// publier.mjs relit le paquet avant de l'envoyer.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Fichiers sans lesquels l'application ne démarre pas, ou ne se met plus à jour. */
export const VITAL_FILES = ['package.json', 'dist/main.js', 'dist/preload.js', 'dist/maj-legere.js', 'dist/veilleur.js', 'renderer/frontend.html', 'renderer/screen.html', 'components.json'];

/** Ce qui manque dans le dossier de l'application (build\app) ; vide : complet. */
export function stageProblems(stage) {
  return VITAL_FILES.filter((f) => !fs.existsSync(path.join(stage, ...f.split('/'))));
}

/** tar.exe de Windows (bsdtar) : il lit et écrit les zip. */
export function windowsTar() {
  return path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
}

/** Ce qui manque dans le paquet (zip) ; une erreur de lecture est rendue comme un manque. */
export function zipProblems(zip, tar = windowsTar()) {
  const run = spawnSync(tar, ['-t', '-f', zip], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) return [`paquet illisible (${(run.error?.message ?? run.stderr ?? '').trim() || `tar ${run.status}`})`];
  const entries = new Set(run.stdout.split(/\r?\n/).map((l) => l.replace(/\\/g, '/').replace(/^\.\//, '')));
  return VITAL_FILES.filter((f) => !entries.has(f));
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM : le processus existe, il appartient à un autre compte.
    return error.code === 'EPERM';
  }
}

/**
 * Verrou de fabrication (release\.fabrication.lock) : une seconde fabrication dans le même dossier
 * est refusée tant que la première tourne. Un verrou laissé par un processus disparu est repris.
 * Rend la fonction qui le libère (appelée aussi à la sortie du processus).
 */
export function lockBuild(releaseDir, pid = process.pid) {
  fs.mkdirSync(releaseDir, { recursive: true });
  const file = path.join(releaseDir, '.fabrication.lock');
  // Fabrication lancée par publier.mjs, qui tient déjà le verrou pour toute la publication.
  const parent = Number(process.env.CYBERPINBALL_FABRICATION_PARENT);
  if (parent) {
    try {
      if (JSON.parse(fs.readFileSync(file, 'utf8')).pid === parent) return () => undefined;
    } catch {
      // Pas de verrou du parent : on le prend comme d'habitude.
    }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, JSON.stringify({ pid, since: new Date().toISOString() }), { flag: 'wx' });
      const release = () => {
        try {
          const held = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (held.pid === pid) fs.rmSync(file, { force: true });
        } catch {
          // Déjà libéré.
        }
      };
      process.once('exit', release);
      return release;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let held;
      try {
        held = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        held = undefined;
      }
      if (held && alive(held.pid)) {
        throw new Error(`une autre fabrication tourne dans ce dossier (processus ${held.pid}, depuis ${held.since}) : attendez sa fin, puis relancez.`);
      }
      // Verrou d'un processus disparu (ou illisible) : repris.
      fs.rmSync(file, { force: true });
    }
  }
  throw new Error('verrou de fabrication impossible à prendre.');
}
