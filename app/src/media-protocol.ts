// Protocole cyber-media:// : les fenêtres du menu lisent les médias des jeux par
// lui, et par lui seulement (frontend.html n'autorise que lui pour les images et
// les vidéos). Il ne sert que des fichiers de média posés directement dans les
// dossiers autorisés (isServedMedia, packages/core/src/mediaview.ts), et les aperçus
// de « Médias du jeu » autorisés un par un (dossier d'import, fichier choisi sur ce
// PC) ; tout le reste reçoit un refus, consigné une fois dans la console.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { protocol } from 'electron';
import { MEDIA_SCHEME, isServedMedia, mediaContentType, mediaPathFromUrl } from '@cyberpinball/core';

// À faire avant que l'application soit prête : un schéma « standard » et « stream »
// permet les requêtes partielles dont la lecture des vidéos a besoin (boucle, saut).
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
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

/** Branche le protocole ; `allowedDirs` est relu à chaque requête (tables ajoutées, retirées). */
export function serveMedias(allowedDirs: () => string[]): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const file = mediaPathFromUrl(request.url);
    if (!file || !(isServedMedia(file, allowedDirs()) || previews.has(file.toLowerCase()))) return refuse(request.url, 403);
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

/** Réponse entière, ou la plage demandée (206) : Chromium lit les vidéos par morceaux. */
function respond(file: string, size: number, range: string | null): Response {
  const type = mediaContentType(file);
  const headers: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    }
    start = Math.max(0, start);
    end = Math.max(start, end);
    return new Response(stream(file, start, end), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(size ? stream(file, 0, size - 1) : null, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
}

function stream(file: string, start: number, end: number): ReadableStream {
  return Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
}

function refuse(what: string, status: number): Response {
  if (!refused.has(what)) {
    refused.add(what);
    console.log(`Médias : ${status === 404 ? 'fichier introuvable' : 'accès refusé hors des dossiers de médias'} : ${what}`);
  }
  return new Response(null, { status });
}
