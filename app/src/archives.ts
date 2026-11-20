// Préparation d'un import : les archives sont listées puis déballées avec le
// tar de Windows (bsdtar, qui lit zip, 7z et rar), sauf les ROM, qui se rangent
// telles quelles. Le déballage se fait dans un dossier de travail sous les données,
// sur le même disque que les tables : l'installation n'est alors qu'un renommage.
//
// RAR que le tar de Windows refuse (20/11/2026, PinCab : « Declared dictionary size is not
// supported » sur un RAR5 à grand dictionnaire, ghostbusters_table_main-1.3.rar) : lu par
// node-unrar-js, le décompresseur de RARLAB compilé en WebAssembly (aucun programme à installer).

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ARCHIVE_EXT, classifyArchive, t, type ImportSource } from '@cyberpinball/core';
import { createExtractorFromFile } from 'node-unrar-js';

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
      result.errors.push(t('{name} : introuvable.', { name }));
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
      result.errors.push(t('{name} : archive illisible ({error}).', { name, error: (error as Error).message.split('\n')[0]! }));
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

/**
 * Déballe une archive dans `dest`, avec les archives qu'elle contient ; false si le
 * fichier n'est pas une archive (il reste alors tel quel).
 */
export async function unpackArchive(file: string, dest: string): Promise<boolean> {
  if (!isArchive(file)) return false;
  await extractArchive(file, dest);
  await unpackNested(dest);
  return true;
}

/**
 * Ce que contient une archive (zip, 7z, rar), sans la déballer ; undefined si le fichier
 * n'en est pas une ou qu'elle est illisible. Sert à vérifier ce qu'on a reçu (liste d'attente).
 */
export async function archiveEntries(file: string): Promise<string[] | undefined> {
  try {
    return isArchive(file) ? await listArchive(file) : undefined;
  } catch {
    return undefined;
  }
}

function isArchive(p: string): boolean {
  return ARCHIVE_EXT.has(path.extname(p).toLowerCase()) && fs.statSync(p).isFile();
}

async function listArchive(file: string): Promise<string[]> {
  try {
    return (await tar(['-tf', file])).split(/\r?\n/).filter(Boolean);
  } catch (error) {
    if (!isRar(file)) throw error;
    return unrarList(file, error as Error);
  }
}

async function extractArchive(file: string, dest: string): Promise<void> {
  fs.mkdirSync(dest, { recursive: true });
  try {
    await tar(['-xf', file, '-C', dest]);
  } catch (error) {
    if (!isRar(file)) throw error;
    // Ce que tar a pu écrire avant d'abandonner est retiré : le déballage repart de zéro.
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    await unrarExtract(file, dest, error as Error);
  }
}

/** Une archive RAR, à son nom ou à sa signature (« Rar! »), même mal nommée. */
export function isRar(file: string): boolean {
  if (/\.rar$/i.test(file)) return true;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const head = Buffer.alloc(4);
      fs.readSync(fd, head, 0, 4, 0);
      return head.toString('latin1') === 'Rar!';
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

/**
 * Le décompresseur de node-unrar-js : fourni à côté du programme fabriqué (dist\unrar.wasm, copié par
 * scripts/fabriquer.mjs, le code étant regroupé par esbuild), sinon celui du paquet (essais, dépôt).
 */
let unrarWasm: ArrayBuffer | undefined;
function unrarBinary(): ArrayBuffer {
  if (unrarWasm) return unrarWasm;
  const beside = path.join(__dirname, 'unrar.wasm');
  const file = fs.existsSync(beside) ? beside : require.resolve('node-unrar-js/dist/js/unrar.wasm');
  // lecture entière : unrar.wasm livré avec l'application (taille fixe, moins de 1 Mo), jamais un fichier de l'utilisateur.
  const bytes = fs.readFileSync(file);
  unrarWasm = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return unrarWasm;
}

/** Nom d'une entrée ramené sous le dossier de destination : ni chemin absolu, ni « .. ». */
export function safeEntryName(name: string): string {
  return name
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..' && !/^[a-z]:$/i.test(part))
    .join('/');
}

/** Contenu d'un RAR lu par node-unrar-js ; `tarError` : pourquoi tar l'a refusé, dit si unrar échoue aussi. */
export async function unrarList(file: string, tarError?: Error): Promise<string[]> {
  try {
    const extractor = await createExtractorFromFile({ wasmBinary: unrarBinary(), filepath: file });
    return [...extractor.getFileList().fileHeaders].map((h) => safeEntryName(h.name) + (h.flags.directory ? '/' : '')).filter((n) => n && n !== '/');
  } catch (error) {
    throw new Error(`${tarError ? `${tarError.message.split('\n')[0]} ; ` : ''}unrar : ${(error as Error).message}`);
  }
}

/** Déballe un RAR avec node-unrar-js dans `dest`, chaque nom ramené sous `dest` (safeEntryName). */
export async function unrarExtract(file: string, dest: string, tarError?: Error): Promise<void> {
  try {
    const extractor = await createExtractorFromFile({ wasmBinary: unrarBinary(), filepath: file, targetPath: dest, filenameTransform: safeEntryName });
    // Le déballage se fait en parcourant les fichiers.
    for (const entry of extractor.extract().files) void entry;
  } catch (error) {
    throw new Error(`${tarError ? `${tarError.message.split('\n')[0]} ; ` : ''}unrar : ${(error as Error).message}`);
  }
}

function tar(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(TAR, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(stdout);
    });
  });
}
