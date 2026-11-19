// Fichiers du Juke-box servis hors du processus principal (jukebox-media-worker.ts, 19/11/2026).
//
// Le lecteur lit ses morceaux locaux (son, vidéo) à l'adresse rendue par streamUrl : un serveur
// HTTP local dans un processus utilitaire, qui ne voit que les fichiers autorisés ici. Tant qu'il
// n'est pas prêt (démarrage, panne), streamUrl ne rend rien et le lecteur garde le protocole
// cyber-media (media-protocol.ts) : la lecture marche toujours, au pire comme avant.
//
//   startJukeboxMedia()          // au démarrage du front-end
//   streamUrl(fichier)           // adresse http://127.0.0.1:<port>/<jeton>/<id>, ou undefined
//   stopJukeboxMedia()           // à la fermeture

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { utilityProcess, type UtilityProcess } from 'electron';

/** Redémarrages après une panne du serveur : au-delà, le protocole cyber-media reste seul. */
const MAX_RESTARTS = 3;

let child: UtilityProcess | undefined;
let base: string | undefined;
let token = '';
let restarts = 0;
let stopping = false;
/** Fichier (minuscules) → identifiant d'adresse, pour ce serveur. */
let ids = new Map<string, string>();
let log: (line: string) => void = () => {};

export function startJukeboxMedia(options: { log?: (line: string) => void } = {}): void {
  if (options.log) log = options.log;
  if (child || stopping) return;
  // Comparaison et repli : CYBERPINBALL_JUKEBOX_PROTOCOLE=1 garde l'ancien chemin (protocole des médias).
  if (process.env.CYBERPINBALL_JUKEBOX_PROTOCOLE === '1') return;
  token = crypto.randomBytes(16).toString('hex');
  ids = new Map();
  base = undefined;
  try {
    child = utilityProcess.fork(path.join(__dirname, 'jukebox-media-worker.js'), [token], { serviceName: 'Cyber Pinball - Juke-box', stdio: 'ignore' }); // i18n-ignore : nom de processus
  } catch (error) {
    log(`Juke-box : serveur des fichiers impossible (${(error as Error).message}) ; lecture par le protocole des médias.`); // i18n-ignore : journal
    child = undefined;
    return;
  }
  const me = child;
  me.on('message', (msg: { port?: number; failed?: string }) => {
    if (child !== me) return;
    if (typeof msg?.port === 'number') base = `http://127.0.0.1:${msg.port}/${token}/`;
    else if (msg?.failed) log(`Juke-box : serveur des fichiers en panne (${msg.failed.slice(0, 160)}) ; lecture par le protocole des médias.`); // i18n-ignore : journal
  });
  me.on('exit', (code) => {
    if (child !== me) return;
    child = undefined;
    base = undefined;
    if (stopping) return;
    log(`Juke-box : serveur des fichiers arrêté (code ${code}) ; lecture par le protocole des médias${restarts < MAX_RESTARTS ? ', relancé' : ''}.`); // i18n-ignore : journal
    if (restarts++ < MAX_RESTARTS) startJukeboxMedia();
  });
}

/** Adresse d'un fichier du Juke-box sur le serveur local ; undefined : pas prêt, garder cyber-media. */
export function streamUrl(file: string): string | undefined {
  if (!child || !base || !file || file.includes('\0') || !path.isAbsolute(file)) return undefined;
  const full = path.resolve(file);
  const key = full.toLowerCase();
  let id = ids.get(key);
  if (!id) {
    // L'extension reste (Chromium s'en sert parfois pour deviner le format) ; le reste ne se devine pas.
    id = `${crypto.randomBytes(12).toString('hex')}${path.extname(full).toLowerCase().replace(/[^.a-z0-9]/g, '')}`;
    ids.set(key, id);
  }
  // Envoyé à chaque fois : un serveur relancé ne connaît plus rien, et le message coûte peu.
  child.postMessage({ id, file: full });
  return base + id;
}

export function stopJukeboxMedia(): void {
  stopping = true;
  child?.kill();
  child = undefined;
  base = undefined;
}
