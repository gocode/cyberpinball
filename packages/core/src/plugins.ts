// Extensions : du code ajouté à Cyber Pinball sans le recompiler, rangé dans
// <données>\plugins\<id>\. Chaque extension porte un plugin.json signé :
//   { format: 1, manifest: "<texte JSON>", signature: "<base64>" }
// la signature Ed25519 portant sur le texte exact du manifeste,
//   { id, name, version, main, api, files: { "<chemin>": "<sha256>" } }
// et chaque fichier listé devant avoir exactement cette empreinte. Seule la clé de
// publication des mises à jour (update-key.ts) est reconnue : une extension non signée,
// signée par une autre clé ou modifiée après signature n'est pas chargée.
// Signature : scripts/signer-extension.mjs ; chargement : app/src/plugins.ts.

import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { UPDATE_PUBLIC_KEY } from './update-key';

export const PLUGINS_DIR = 'plugins';
export const PLUGIN_FILE = 'plugin.json';
/** Version de l'interface offerte aux extensions (app/src/plugins.ts). */
export const PLUGIN_API = 1;

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** Fichier chargé (CommonJS), qui exporte activate(api). */
  main: string;
  /** Version de l'interface attendue. */
  api: number;
  files: Record<string, string>;
}

export type PluginCheck = { ok: true; dir: string; manifest: PluginManifest } | { ok: false; dir: string; reason: string };

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function pluginsDir(dataDir: string): string {
  return path.join(dataDir, PLUGINS_DIR);
}

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Chemin relatif sûr (ni absolu, ni « .. »), toujours avec des « / ». */
function safeRelative(rel: string): boolean {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel) || rel.includes('\\')) return false;
  return rel.split('/').every((part) => part && part !== '.' && part !== '..');
}

function listFiles(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(dir, rel));
    else if (entry.isFile() && rel !== PLUGIN_FILE) out.push(rel);
  }
  return out.sort();
}

function checkManifest(m: PluginManifest): string | undefined {
  if (!m || typeof m.id !== 'string' || !ID.test(m.id)) return 'bad id';
  if (typeof m.name !== 'string' || !m.name.trim() || typeof m.version !== 'string' || !m.version.trim()) return 'no name or version';
  if (typeof m.api !== 'number') return 'no api version';
  if (!m.files || typeof m.files !== 'object') return 'no file list';
  for (const [rel, hash] of Object.entries(m.files)) if (!safeRelative(rel) || typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return `bad file entry ${rel}`;
  if (typeof m.main !== 'string' || !(m.main in m.files)) return 'main not listed';
  return undefined;
}

/** Signe le dossier d'une extension : écrit son plugin.json (tous les fichiers du dossier sont listés). */
export function signPlugin(dir: string, info: Omit<PluginManifest, 'files' | 'api'> & { api?: number }, privateKeyPem: string): PluginManifest {
  const files: Record<string, string> = {};
  for (const rel of listFiles(dir)) files[rel] = sha256(path.join(dir, ...rel.split('/')));
  const manifest: PluginManifest = { id: info.id, name: info.name, version: info.version, main: info.main, api: info.api ?? PLUGIN_API, files };
  const problem = checkManifest(manifest);
  if (problem) throw new Error(`plugin: ${problem}`);
  const text = JSON.stringify(manifest, null, 2);
  const signature = sign(null, Buffer.from(text, 'utf8'), createPrivateKey(privateKeyPem)).toString('base64');
  fs.writeFileSync(path.join(dir, PLUGIN_FILE), JSON.stringify({ format: 1, manifest: text, signature }, null, 2) + '\n', 'utf8');
  return manifest;
}

/** Vérifie une extension : signature, forme du manifeste, empreinte de chaque fichier listé. */
export function checkPlugin(dir: string, publicKeyPem: string = UPDATE_PUBLIC_KEY): PluginCheck {
  let envelope: { format?: unknown; manifest?: unknown; signature?: unknown };
  try {
    envelope = JSON.parse(fs.readFileSync(path.join(dir, PLUGIN_FILE), 'utf8').replace(/^﻿/, ''));
  } catch {
    return { ok: false, dir, reason: `no readable ${PLUGIN_FILE}` };
  }
  if (envelope.format !== 1 || typeof envelope.manifest !== 'string' || typeof envelope.signature !== 'string') return { ok: false, dir, reason: 'unknown format' };
  let signed = false;
  try {
    signed = verify(null, Buffer.from(envelope.manifest, 'utf8'), createPublicKey(publicKeyPem), Buffer.from(envelope.signature, 'base64'));
  } catch {
    signed = false;
  }
  if (!signed) return { ok: false, dir, reason: 'not signed by the Cyber Pinball key' };
  let manifest: PluginManifest;
  try {
    manifest = JSON.parse(envelope.manifest) as PluginManifest;
  } catch {
    return { ok: false, dir, reason: 'unreadable manifest' };
  }
  const problem = checkManifest(manifest);
  if (problem) return { ok: false, dir, reason: problem };
  if (manifest.id !== path.basename(dir)) return { ok: false, dir, reason: `folder name differs from id ${manifest.id}` };
  for (const [rel, hash] of Object.entries(manifest.files)) {
    let actual: string;
    try {
      actual = sha256(path.join(dir, ...rel.split('/')));
    } catch {
      return { ok: false, dir, reason: `missing file ${rel}` };
    }
    if (actual !== hash) return { ok: false, dir, reason: `modified file ${rel}` };
  }
  return { ok: true, dir, manifest };
}

/** Extensions présentes dans <données>\plugins, vérifiées, par ordre alphabétique. */
export function discoverPlugins(dataDir: string, publicKeyPem: string = UPDATE_PUBLIC_KEY): PluginCheck[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(pluginsDir(dataDir), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => checkPlugin(path.join(pluginsDir(dataDir), name), publicKeyPem));
}
