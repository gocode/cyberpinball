// Protocole cyber-media:// : les fenêtres du menu lisent les médias des jeux par
// lui, et par lui seulement (frontend.html n'autorise que lui pour les images et
// les vidéos). Il ne sert que des fichiers de média posés directement dans les
// dossiers autorisés (isServedMedia, packages/core/src/mediaview.ts), et les aperçus
// de « Médias du jeu » autorisés un par un (dossier d'import, fichier choisi sur ce
// PC) ; tout le reste reçoit un refus, consigné une fois dans la console.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { protocol } from 'electron';
import { mediaResponse } from './media-response';
import { JUKEBOX_AUDIO_EXTENSIONS, JUKEBOX_VIDEO_EXTENSIONS, MEDIA_SCHEME, isServedMedia, mediaContentType, mediaPathFromUrl } from '@cyberpinball/core';

// À faire avant que l'application soit prête : un schéma « standard » et « stream »
// permet les requêtes partielles dont la lecture des vidéos a besoin (boucle, saut).
protocol.registerSchemesAsPrivileged([
  // corsEnabled : le Juke-box lit ses sons en « crossOrigin » pour en mesurer le niveau (captureStream).
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
]);

const refused = new Set<string>();
/** Aperçus autorisés hors des dossiers de médias (chemins complets, en minuscules). */
const previews = new Set<string>();

/**
 * Aperçu d'un fichier qui n'est pas encore rangé (« Médias du jeu » : dossier d'import,
 * fichier choisi sur ce PC ou glissé) : ce fichier-là, et lui seul, devient lisible,
 * s'il a une extension de média.
 */
export function allowPreview(file: string): void {
  if (isServedMedia(file, [path.dirname(file)])) previews.add(path.resolve(file).toLowerCase());
}

/** Fichiers du Juke-box autorisés un par un (son, vidéo, pochette, miniature : jukebox-player.ts). */
const jukebox = new Set<string>();
const JUKEBOX_EXTENSIONS = new Set<string>([...JUKEBOX_AUDIO_EXTENSIONS, ...JUKEBOX_VIDEO_EXTENSIONS, 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']);

/**
 * Un fichier que le Juke-box va lire ou montrer : un morceau de la bibliothèque, un fichier local
 * ajouté à une playlist, sa pochette. Lui seul devient lisible, s'il a une extension de son, de
 * vidéo ou d'image.
 */
export function allowJukebox(file: string): void {
  if (!file || file.includes('\0') || !path.isAbsolute(file)) return;
  if (JUKEBOX_EXTENSIONS.has(path.extname(file).slice(1).toLowerCase())) jukebox.add(path.resolve(file).toLowerCase());
}

/** Branche le protocole ; `allowedDirs` est relu à chaque requête (tables ajoutées, retirées). */
export function serveMedias(allowedDirs: () => string[]): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const file = mediaPathFromUrl(request.url);
    if (!file || !(isServedMedia(file, allowedDirs()) || previews.has(file.toLowerCase()) || jukebox.has(file.toLowerCase()))) return refuse(request.url, 403);
    let stat: fs.Stats;
    try {
      // Un lien symbolique pourrait mener hors des dossiers autorisés : refusé.
      stat = await fs.promises.lstat(file);
    } catch {
      return refuse(file, 404);
    }
    if (!stat.isFile()) return refuse(file, 403);
    return respond(file, stat.size, request.headers.get('range'));
  });
}

/** Jamais de fichier gardé ouvert entre deux morceaux : la table affichée reste déplaçable (media-response.ts). */
function respond(file: string, size: number, range: string | null): Response {
  return mediaResponse(file, size, range, mediaContentType(file));
}

function refuse(what: string, status: number): Response {
  if (!refused.has(what)) {
    refused.add(what);
    console.log(`Médias : ${status === 404 ? 'fichier introuvable' : 'accès refusé hors des dossiers de médias'} : ${what}`);
  }
  return new Response(null, { status });
}
