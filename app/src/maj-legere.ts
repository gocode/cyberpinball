// Mise à jour légère, second temps (packages/core/src/update.ts) : Cyber Pinball a téléchargé
// et déplié le paquet de l'application, puis lance ce script avant de se fermer, par son propre
// exécutable en mode Node (ELECTRON_RUN_AS_NODE) :
//   CyberPinball.exe <dossier>\maj-legere.js <dossier>\maj-legere.json
// Il attend la fin de Cyber Pinball, remplace app\resources\app (l'ancien gardé jusqu'au bout,
// remis en place en cas d'échec), met la version à jour dans « Programmes et fonctionnalités »,
// puis relance Cyber Pinball avec ses arguments d'avant. Au démarrage, data\mise-a-jour.json
// dit si la nouvelle version est là.
//
// C'est le script de la nouvelle version qui tourne (copié du paquet déplié à côté du
// téléchargement) : la mise en place profite de ses corrections. Il ne dépend ni d'Electron ni
// de koffi, et n'écrit que dans la racine de la borne et dans HKCU.

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { swapAppDir, waitForExit, type LightUpdateJob } from '@cyberpinball/core';

/** Clé de « Programmes et fonctionnalités », écrite par l'installeur (scripts/installeur/cyberpinball.nsi). */
const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CyberPinball';

async function main(): Promise<void> {
  const jobFile = process.argv[2];
  if (!jobFile) throw new Error('Usage : CyberPinball.exe maj-legere.js <maj-legere.json> (ELECTRON_RUN_AS_NODE=1)'); // i18n-ignore : usage
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8')) as LightUpdateJob;
  const log = (text: string) => fs.appendFileSync(job.log, `${new Date().toISOString()} ${text}\n`, 'utf8');
  log(`Mise à jour légère vers ${job.version} : attente de la fermeture de Cyber Pinball (${job.pid}).`); // i18n-ignore : journal
  if (!(await waitForExit(job.pid, 60_000))) log('Cyber Pinball tourne encore après 60 s : remplacement tenté quand même.'); // i18n-ignore : journal
  try {
    const cleaned = await swapAppDir(job.appDir, job.staged);
    log(`${job.appDir} remplacé.${cleaned ? '' : ' Ancienne version encore tenue : retirée au prochain démarrage.'}`); // i18n-ignore : journal
    if (job.registry) updateRegistry(job, log);
  } catch (error) {
    log(`Échec, version précédente gardée : ${(error as Error).message}`); // i18n-ignore : journal
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(job.exe, job.args, { detached: true, stdio: 'ignore', cwd: job.cwd, env }).unref();
  log(`Relance : ${job.exe} ${job.args.join(' ')}`);
}

/** Version affichée par « Programmes et fonctionnalités », si l'installation est bien celle de cette clé. */
function updateRegistry(job: LightUpdateJob, log: (text: string) => void): void {
  const query = spawnSync('reg', ['query', UNINSTALL_KEY, '/v', 'InstallLocation'], { encoding: 'utf8', windowsHide: true });
  const location = /InstallLocation\s+REG_\w+\s+(.+)/.exec(query.stdout ?? '')?.[1]?.trim();
  if (!location || path.resolve(location).toLowerCase() !== path.dirname(job.exe).toLowerCase()) return;
  const set = spawnSync('reg', ['add', UNINSTALL_KEY, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', job.version, '/f'], { windowsHide: true });
  log(set.status === 0 ? `Programmes et fonctionnalités : version ${job.version}.` : 'Programmes et fonctionnalités : version non écrite.'); // i18n-ignore : journal
}

void main();
