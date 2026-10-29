// Sources du gestionnaire de téléchargements (packages/core/src/downloadmanager.ts) : comment
// chaque sorte de source envoie un fichier, et le reprend là où il s'était arrêté.
// - un ami : le réseau des bornes (friend-content.ts, fetchFile), qui garde le partiel quand
//   l'ami se déconnecte et redemande la suite à son retour ;
// - une adresse directe : resumable.ts (en-tête Range), pour ce que la file télécharge elle-même.
// Les pages des sites passent par le navigateur intégré (acquire-window.ts, siteTransport), et
// VPinMediaDB, la mise à jour, VPX et yt-dlp par l'écran qui les suit (manager.track).
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un réseau d'essai.

import * as fs from 'node:fs';
import { fetchResumable, ResumableError, type DownloadReason, type DownloadTransport, type LibraryMedia, type TransportResult } from '@cyberpinball/core';
import type { FetchFailure, FriendContent } from './friend-content';
import type { SocialNet } from './social-net';

/** Raison d'un échec du réseau des bornes, dans les mots du gestionnaire. */
export function friendReason(reason: FetchFailure): DownloadReason {
  switch (reason) {
    case 'offline':
    case 'timeout':
      return 'offline';
    case 'busy':
      return 'busy';
    case 'size':
      return 'size';
    case 'sha':
      return 'sha';
    case 'check':
      return 'check';
    default:
      return 'refused';
  }
}

/**
 * Un ami : là quand il est relié. Un média va dans le dossier d'attente des médias reçus (nommé
 * par son empreinte) ; un fichier de table à sa place dans le dossier de la table reçue.
 */
export function friendTransport(content: Pick<FriendContent, 'fetchFile'>, net: Pick<SocialNet, 'online'>): DownloadTransport {
  return {
    available: (job) => Boolean(job.source.key && net.online(job.source.key)),
    async fetch({ job, file, signal, progress }): Promise<TransportResult> {
      const key = job.source.key ?? '';
      const table = String(job.data?.table ?? '');
      const media = file.meta?.media as LibraryMedia | undefined;
      const target = media ? { kind: 'media' as const, media } : file.dest ? { kind: 'file' as const, dest: file.dest } : undefined;
      if (!target) return { ok: false, reason: 'refused', detail: 'destination inconnue' }; // i18n-ignore : journal
      const r = await content.fetchFile(key, table, file.ref, target, file.part, (bytes) => progress(bytes, file.bytes), signal, file.bytes);
      if ('file' in r) return { ok: true, file: r.file, bytes: r.bytes, sha256: r.sha256 };
      return { ok: false, reason: friendReason(r.reason) };
    },
  };
}

/** Raison d'un échec HTTP repris, dans les mots du gestionnaire. */
export function httpReason(error: unknown): { reason: DownloadReason; detail?: string } {
  if (error instanceof ResumableError) {
    if (error.reason === 'http') return { reason: error.status === 401 || error.status === 403 ? 'login' : error.status && error.status >= 500 ? 'network' : 'http', detail: error.message };
    if (error.reason === 'size') return { reason: 'size', detail: error.message };
    return { reason: 'network', detail: error.message };
  }
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOSPC') return { reason: 'disk' };
  return { reason: 'network', detail: (error as Error)?.message };
}

/**
 * Une adresse directe, reprise par l'en-tête Range : le fichier va à `dest` une fois vérifié
 * (taille, et SHA-256 si le téléchargement en annonce un dans `meta.sha256`).
 */
export function httpTransport(fetchImpl?: typeof fetch): DownloadTransport {
  return {
    available: () => true,
    async fetch({ file, signal, progress, remember }): Promise<TransportResult> {
      const expected = typeof file.meta?.sha256 === 'string' ? file.meta.sha256 : undefined;
      try {
        const got = await fetchResumable({
          url: file.ref,
          part: file.part,
          ...(fetchImpl ? { fetch: fetchImpl } : {}),
          signal,
          ...(file.bytes !== undefined ? { size: file.bytes } : {}),
          validator: (file.meta?.validator as { etag?: string; lastModified?: string } | undefined) ?? undefined,
          hashes: ['sha256'],
          onData: (received, total) => progress(received, total),
          onValidator: (validator) => remember({ validator }),
        });
        if (expected && got.sha256 !== expected) return { ok: false, reason: 'sha' };
        const dest = file.dest ?? file.part.replace(/\.part$/i, '');
        fs.rmSync(dest, { force: true });
        fs.renameSync(file.part, dest);
        return { ok: true, file: dest, bytes: got.received, ...(got.sha256 ? { sha256: got.sha256 } : {}) };
      } catch (error) {
        return { ok: false, ...httpReason(error) };
      }
    },
  };
}
