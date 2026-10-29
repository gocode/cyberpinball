import * as fs from 'node:fs';
import * as path from 'node:path';
import { fetchResumable, ResumableError, t } from '@cyberpinball/core';
import { sha256OfFile } from './fsutil';
import type { Component } from './manifest';

export type Progress = (received: number, total: number) => void;

/**
 * Télécharge l'archive d'un composant dans downloads/, ou réutilise celle qui y
 * est déjà si son empreinte est bonne. Une archive dont l'empreinte ne
 * correspond pas au manifeste est supprimée, jamais installée.
 */
export async function downloadComponent(component: Component, downloadsDir: string, onProgress?: Progress): Promise<string> {
  fs.mkdirSync(downloadsDir, { recursive: true });
  const file = path.join(downloadsDir, path.basename(new URL(component.url).pathname));

  if (fs.existsSync(file) && (await sha256OfFile(file)) === component.sha256) return file;

  // Reçu sous « .part », repris là où il s'était arrêté après une coupure (resumable.ts de @cyberpinball/core).
  const part = `${file}.part`;
  try {
    await fetchResumable({ url: component.url, part, ...(component.size ? { size: component.size } : {}), onData: (received, total) => onProgress?.(received, total ?? component.size) });
  } catch (error) {
    if (error instanceof ResumableError && error.reason === 'http') {
      fs.rmSync(part, { force: true });
      throw new Error(t('Téléchargement impossible (HTTP {status}) : {url}', { status: error.status ?? 0, url: component.url }));
    }
    throw error;
  }

  const actual = await sha256OfFile(part);
  if (actual !== component.sha256) {
    fs.rmSync(part);
    throw new Error(t('Empreinte SHA-256 incorrecte pour {name} : attendu {expected}, obtenu {actual}. Fichier supprimé.', { name: component.name, expected: component.sha256, actual }));
  }
  fs.renameSync(part, file);
  return file;
}
