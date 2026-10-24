// Garde-fou du bac à sable, installé avant tout le reste (main.ts, sync-cli.ts) :
// pendant un essai sans opérateur dans un bac à sable, toute écriture de fichier
// hors du bac à sable est refusée, avec un message qui donne le chemin fautif.
// Les écritures de Chromium (profil d'Electron) ne passent pas par ici.

import type * as FsModule from 'node:fs';
import { isWriteAllowed, sandboxPolicy } from '@cyberpinball/core';

// Le vrai module : « import * as fs » donne une copie en lecture seule (TypeScript et
// esbuild), que les autres modules ne liraient de toute façon pas.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs: typeof FsModule = require('node:fs');

const policy = sandboxPolicy(process.env, process.cwd());

function check(target: FsModule.PathLike | number): void {
  if (typeof target === 'number' || !policy) return;
  const file = target.toString();
  if (isWriteAllowed(policy, file, process.cwd())) return;
  const message = `Garde-fou du bac à sable : écriture refusée hors du bac à sable (${file}). Autorisé : ${policy.allowed.join(', ')}`;
  console.error(message);
  throw new Error(message);
}

type Fn = (...args: never[]) => unknown;

/** Remplace une fonction de fs par une version qui vérifie les chemins donnés par `paths`. */
function guard(target: object, name: string, paths: (args: unknown[]) => unknown[]): void {
  const record = target as Record<string, Fn>;
  const original = record[name];
  if (typeof original !== 'function') return;
  record[name] = function (this: unknown, ...args: unknown[]) {
    for (const p of paths(args)) check(p as FsModule.PathLike);
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  } as Fn;
}

if (policy) {
  const first = (args: unknown[]) => [args[0]];
  const both = (args: unknown[]) => [args[0], args[1]];
  const second = (args: unknown[]) => [args[1]];
  for (const api of [fs, fs.promises] as object[]) {
    for (const name of ['writeFile', 'appendFile', 'rm', 'rmdir', 'unlink', 'mkdir', 'truncate', 'open']) {
      guard(api, name, name === 'open' ? (args) => (/[wa+]/.test(String(args[1] ?? 'r')) ? [args[0]] : []) : first);
    }
    for (const name of ['rename']) guard(api, name, both);
    for (const name of ['copyFile', 'cp', 'link', 'symlink']) guard(api, name, second);
  }
  for (const name of ['writeFileSync', 'appendFileSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'mkdirSync', 'truncateSync']) guard(fs, name, first);
  guard(fs, 'openSync', (args) => (/[wa+]/.test(String(args[1] ?? 'r')) ? [args[0]] : []));
  guard(fs, 'renameSync', both);
  for (const name of ['copyFileSync', 'cpSync', 'linkSync', 'symlinkSync']) guard(fs, name, second);
  guard(fs, 'createWriteStream', first);
}
