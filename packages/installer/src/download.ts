import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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

  const part = `${file}.part`;
  const response = await fetch(component.url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Téléchargement impossible (HTTP ${response.status}) : ${component.url}`);

  const total = Number(response.headers.get('content-length')) || component.size;
  let received = 0;
  const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  body.on('data', (chunk: Buffer) => {
    received += chunk.length;
    onProgress?.(received, total);
  });
  await pipeline(body, fs.createWriteStream(part));

  const actual = await sha256OfFile(part);
  if (actual !== component.sha256) {
    fs.rmSync(part);
    throw new Error(`Empreinte SHA-256 incorrecte pour ${component.name} : attendu ${component.sha256}, obtenu ${actual}. Fichier supprimé.`);
  }
  fs.renameSync(part, file);
  return file;
}
