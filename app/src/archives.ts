// Préparation d'un import : les archives sont listées puis déballées avec le
// tar de Windows (bsdtar, qui lit zip, 7z et rar), sauf les ROM, qui se rangent
// telles quelles. Le déballage se fait dans un dossier de travail sous les données,
// sur le même disque que les tables : l'installation n'est alors qu'un renommage.

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ARCHIVE_EXT, classifyArchive, type ImportSource } from '@cyberpinball/core';

const TAR = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');

export interface PreparedImport {
  sources: ImportSource[];
  /** Archives d'origine, à mettre à la corbeille après l'import si elles venaient du dossier d'import. */
  archives: { path: string; mode: 'move' | 'copy' }[];
  errors: string[];
  staging: string;
}

/**
 * Transforme ce que l'utilisateur a choisi en sources d'import. mode « move » pour
 * le dossier d'import (il se vide), « copy » pour des fichiers choisis sur le PC.
 */
export async function prepareImport(paths: string[], mode: 'move' | 'copy', stagingRoot: string): Promise<PreparedImport> {
  fs.mkdirSync(stagingRoot, { recursive: true });
  const staging = fs.mkdtempSync(path.join(stagingRoot, 'import-'));
  const result: PreparedImport = { sources: [], archives: [], errors: [], staging };
  for (const [i, p] of paths.entries()) {
    const name = path.basename(p);
    if (!fs.existsSync(p)) {
      result.errors.push(`${name} : introuvable.`);
      continue;
    }
    if (!isArchive(p)) {
      result.sources.push({ path: p, mode });
      continue;
    }
    try {
      const entries = await listArchive(p);
      if (classifyArchive(name, entries) === 'rom') {
        result.sources.push({ path: p, mode });
        continue;
      }
      const dest = path.join(staging, String(i));
      await extractArchive(p, dest);
      await unpackNested(dest);
      result.sources.push({ path: dest, label: name, mode: 'move', unpacked: true });
      result.archives.push({ path: p, mode });
    } catch (error) {
      result.errors.push(`${name} : archive illisible (${(error as Error).message.split('\n')[0]}).`);
    }
  }
  return result;
}

/** Archives contenues dans une archive (un pack PuP zippé dans le paquet de la table…). */
async function unpackNested(dir: string): Promise<void> {
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!dirent.isFile()) continue;
    const p = path.join(dirent.parentPath, dirent.name);
    if (!isArchive(p)) continue;
    if (classifyArchive(dirent.name, await listArchive(p)) === 'rom') continue;
    const dest = path.join(dirent.parentPath, dirent.name.replace(/\.[^.]+$/, ''));
    await extractArchive(p, dest);
    fs.rmSync(p);
  }
}

function isArchive(p: string): boolean {
  return ARCHIVE_EXT.has(path.extname(p).toLowerCase()) && fs.statSync(p).isFile();
}

function listArchive(file: string): Promise<string[]> {
  return tar(['-tf', file]).then((out) => out.split(/\r?\n/).filter(Boolean));
}

async function extractArchive(file: string, dest: string): Promise<void> {
  fs.mkdirSync(dest, { recursive: true });
  await tar(['-xf', file, '-C', dest]);
}

function tar(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(TAR, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout);
    });
  });
}
