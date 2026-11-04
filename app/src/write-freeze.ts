// Gel des écritures, juste avant le redémarrage qui pose une restauration (backups-menu.ts) : le
// processus qui s'en va reste ouvert une ou deux secondes, le temps que le nouveau couvre les écrans
// (relaunchCovered). Pendant ce temps, rien de ce qu'il avait en mémoire (amis, réglages du menu,
// file des téléchargements…) ne doit réécrire un fichier que le nouveau vient de restaurer : toute
// écriture dans la racine ou le dossier des données est refusée, sauf le journal. Les modules qui
// écrivent notent un refus au journal sans s'arrêter (saveOrWarn). Même mécanisme que le garde-fou
// du bac à sable (sandbox-guard.ts), branché seulement à la demande.

import type * as FsModule from 'node:fs';
import * as path from 'node:path';
import { isInside } from '@cyberpinball/core';

// Le vrai module, comme sandbox-guard.ts : les autres modules le lisent par lui.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs: typeof FsModule = require('node:fs');

let frozen: { dirs: string[]; allowed: string[] } | undefined;

function check(target: unknown): void {
  if (!frozen || typeof target === 'number' || target === undefined || target === null) return;
  const file = path.resolve(String(target));
  if (frozen.allowed.some((dir) => isInside(file, dir))) return;
  if (!frozen.dirs.some((dir) => isInside(file, dir))) return;
  const error = new Error(`Écriture refusée : une restauration va être posée au redémarrage (${file})`) as NodeJS.ErrnoException; // i18n-ignore : journal
  error.code = 'EPERM';
  throw error;
}

type Fn = (...args: unknown[]) => unknown;
let installed = false;

function install(): void {
  if (installed) return;
  installed = true;
  const wrap = (target: object, name: string, paths: (args: unknown[]) => unknown[]) => {
    const record = target as Record<string, Fn>;
    const original = record[name];
    if (typeof original !== 'function') return;
    const promised = target === fs.promises;
    record[name] = function (this: unknown, ...args: unknown[]) {
      try {
        for (const p of paths(args)) check(p);
      } catch (error) {
        // fs.promises : un refus est une promesse rejetée, comme toute erreur d'écriture.
        if (promised) return Promise.reject(error);
        throw error;
      }
      return original.apply(this, args);
    };
  };
  const first = (args: unknown[]) => [args[0]];
  const both = (args: unknown[]) => [args[0], args[1]];
  const second = (args: unknown[]) => [args[1]];
  const opening = (args: unknown[]) => (/[wa+]/.test(String(args[1] ?? 'r')) ? [args[0]] : []);
  for (const api of [fs, fs.promises] as object[]) {
    for (const name of ['writeFile', 'appendFile', 'rm', 'rmdir', 'unlink', 'mkdir', 'truncate']) wrap(api, name, first);
    wrap(api, 'open', opening);
    wrap(api, 'rename', both);
    for (const name of ['copyFile', 'cp', 'link', 'symlink']) wrap(api, name, second);
  }
  for (const name of ['writeFileSync', 'appendFileSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'mkdirSync', 'truncateSync']) wrap(fs, name, first);
  wrap(fs, 'openSync', opening);
  wrap(fs, 'renameSync', both);
  for (const name of ['copyFileSync', 'cpSync', 'linkSync', 'symlinkSync']) wrap(fs, name, second);
  wrap(fs, 'createWriteStream', first);
}

/** Plus aucune écriture dans `dirs` (sauf dans `allowed`), jusqu'à la fin du processus. */
export function freezeWrites(dirs: string[], allowed: string[] = []): void {
  install();
  frozen = { dirs: dirs.map((d) => path.resolve(d)), allowed: allowed.map((d) => path.resolve(d)) };
  console.log(`Écritures gelées jusqu'au redémarrage : ${frozen.dirs.join(', ')}`); // i18n-ignore : journal
}
