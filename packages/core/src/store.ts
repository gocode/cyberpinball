// Persistance du modèle de borne (cabinet.json : toutes ses configurations) et de
// la mémoire des clés écrites. Le prototype utilise des fichiers JSON ; la spec
// prévoit SQLite, à brancher derrière ces mêmes fonctions.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  activeConfiguration,
  addConfiguration,
  chooseConfiguration,
  chosenId,
  configIniPath,
  explainChoice,
  rememberChoice,
  toCabinetSet,
  type CabinetConfiguration,
  type CabinetSet,
  type ConfigurationChoice,
} from './configurations';
import { t } from './i18n';
import type { Cabinet, ObservedDisplay } from './model';
import type { OwnedMemory, SyncFinding } from './sync';

export const CABINET_FILE = 'cabinet.json';
export const OWNED_MEMORY_FILE = 'vpx-owned.json';
/** Copie de l'ancien cabinet.json (un seul modèle), faite à sa conversion. */
export const CABINET_V1_BACKUP = 'cabinet-v1.json';
const BACKUPS_KEPT = 10;

/**
 * Toutes les configurations de la borne. Un cabinet.json d'avant les
 * configurations est converti à la première lecture : l'ancien fichier est gardé
 * à côté (cabinet-v1.json), puis le nouveau est enregistré.
 */
export function loadCabinetSet(home: string): CabinetSet | undefined {
  const file = path.join(home, CABINET_FILE);
  if (!fs.existsSync(file)) return undefined;
  const { set, migrated } = toCabinetSet(readJsonFile(file));
  if (migrated) {
    const backup = path.join(home, CABINET_V1_BACKUP);
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
    saveCabinetSet(home, set);
  }
  return set;
}

export function saveCabinetSet(home: string, set: CabinetSet): string {
  const file = path.join(home, CABINET_FILE);
  writeAtomic(file, JSON.stringify({ ...set, updatedAt: new Date().toISOString() }, null, 2) + '\n');
  return file;
}

/** Lit, modifie et réenregistre l'ensemble des configurations. */
export function updateCabinetSet(home: string, change: (set: CabinetSet) => CabinetSet): CabinetSet | undefined {
  const set = loadCabinetSet(home);
  if (!set) return undefined;
  const next = change(set);
  saveCabinetSet(home, next);
  return next;
}

/** Configuration active : celle que lisent le menu, les réglages de VPX et l'assistant. */
export function loadCabinet(home: string): CabinetConfiguration | undefined {
  const set = loadCabinetSet(home);
  return set && activeConfiguration(set);
}

/**
 * Enregistre une configuration : celle qui porte le même identifiant, sinon la
 * configuration active (l'assistant, l'étape « Boutons » et la remise des touches
 * refont celle qui sert). Sans aucune configuration, crée la première, « Borne ».
 */
export function saveCabinet(home: string, cabinet: Cabinet | CabinetConfiguration): string {
  const set = loadCabinetSet(home);
  const target = set && (set.configurations.find((c) => c.id === (cabinet as Partial<CabinetConfiguration>).id) ?? activeConfiguration(set));
  if (!set || !target) return saveCabinetSet(home, addConfiguration(set, cabinet).set);
  // Réglages que l'assistant ne demande pas (écran du navigateur intégré) : gardés quand il refait le modèle.
  const kept = !('browserScreen' in cabinet) && target.browserScreen ? { browserScreen: target.browserScreen } : {};
  const saved: CabinetConfiguration = { ...kept, ...cabinet, id: target.id, name: target.name, ...(target.iniFile && { iniFile: target.iniFile }), updatedAt: new Date().toISOString() };
  return saveCabinetSet(home, { ...set, configurations: set.configurations.map((c) => (c.id === target.id ? saved : c)) });
}

/**
 * Nouvelle configuration (assistant lancé par « Nouvelle configuration ») : elle
 * devient active et retenue pour ces écrans. Son VPinballX.ini part d'une copie de
 * celui de la configuration active, pour garder les réglages faits à la main qui ne
 * dépendent pas des écrans (qualité graphique, physique…) ; la synchronisation y
 * écrit ensuite les clés des écrans, du son et des boutons.
 */
export function createConfiguration(home: string, baseIni: string, cabinet: Cabinet, observed: ObservedDisplay[], name?: string): CabinetConfiguration {
  const set = loadCabinetSet(home);
  const from = set && activeConfiguration(set);
  const added = addConfiguration(set, cabinet, name);
  const ini = configIniPath(baseIni, added.configuration);
  const source = configIniPath(baseIni, from);
  if (from && !fs.existsSync(ini) && fs.existsSync(source)) {
    fs.mkdirSync(path.dirname(ini), { recursive: true });
    fs.copyFileSync(source, ini);
  }
  const configuration = { ...added.configuration, vpx: { iniPath: ini } };
  const next = rememberChoice(
    { ...added.set, configurations: added.set.configurations.map((c) => (c.id === configuration.id ? configuration : c)) },
    observed,
    configuration.id,
  );
  saveCabinetSet(home, next);
  return configuration;
}

export interface ConfigurationSelection {
  choice: ConfigurationChoice;
  /** Configuration à utiliser ; undefined quand l'utilisateur doit choisir. */
  configuration?: CabinetConfiguration;
  /** Configuration utilisée jusque-là, quand la reconnaissance en change. */
  previous?: CabinetConfiguration;
  /** Constats de la reconnaissance, à joindre à ceux de la synchronisation. */
  findings: SyncFinding[];
  /** Explication en une phrase. */
  summary: string;
}

/**
 * Reconnaît la configuration branchée (démarrage, avant chaque partie, commande
 * sync) et en fait la configuration active. Ambiguïté ou aucune correspondance :
 * rien ne change, l'utilisateur choisit (constat bloquant pour la synchronisation).
 */
export function selectConfiguration(home: string, observed: ObservedDisplay[]): ConfigurationSelection | undefined {
  const set = loadCabinetSet(home);
  if (!set) return undefined;
  const choice = chooseConfiguration(set, observed);
  const summary = explainChoice(set, choice);
  const configuration = set.configurations.find((c) => c.id === chosenId(choice));
  if (!configuration) {
    return { choice, summary, findings: [{ severity: 'blocking', message: t('Configuration de la borne à choisir. {summary}', { summary }) }] };
  }
  const before = activeConfiguration(set);
  const previous = before && before.id !== configuration.id ? before : undefined;
  if (set.active !== configuration.id) saveCabinetSet(home, { ...set, active: configuration.id });
  const score = choice.scores.find((s) => s.id === configuration.id)!;
  const findings: SyncFinding[] = [];
  if (previous) {
    findings.push({ severity: 'warning', message: t('Configuration changée : « {name} » à la place de « {previous} ». {summary}', { name: configuration.name, previous: previous.name, summary }) });
  } else findings.push({ severity: score.missing.length ? 'warning' : 'info', message: t('Configuration {summary}', { summary }) });
  return { choice, configuration, previous, findings, summary };
}

/**
 * Mémoire des clés écrites, un jeu de valeurs par VPinballX.ini : chaque
 * configuration a le sien. L'ancien format (un seul fichier) est lu comme une entrée.
 */
interface OwnedMemoryFile {
  version: 2;
  files: { iniPath: string; values: OwnedMemory }[];
}

function readOwnedMemoryFile(home: string): OwnedMemoryFile {
  const file = path.join(home, OWNED_MEMORY_FILE);
  if (!fs.existsSync(file)) return { version: 2, files: [] };
  const saved = readJsonFile(file) as Partial<OwnedMemoryFile> & { iniPath?: string; values?: OwnedMemory };
  if (Array.isArray(saved.files)) return { version: 2, files: saved.files };
  return { version: 2, files: saved.iniPath && saved.values ? [{ iniPath: saved.iniPath, values: saved.values }] : [] };
}

const samePath = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Valeurs des clés gérées écrites la dernière fois dans ce VPinballX.ini ; undefined s'il n'a jamais été écrit. */
export function loadOwnedMemory(home: string, iniPath: string): OwnedMemory | undefined {
  return readOwnedMemoryFile(home).files.find((f) => samePath(f.iniPath, iniPath))?.values;
}

export function saveOwnedMemory(home: string, iniPath: string, values: OwnedMemory): void {
  const memory = readOwnedMemoryFile(home);
  const files = [...memory.files.filter((f) => !samePath(f.iniPath, iniPath)), { iniPath, values }];
  writeAtomic(path.join(home, OWNED_MEMORY_FILE), JSON.stringify({ version: 2, files }, null, 2) + '\n');
}

/**
 * Fichier JSON, BOM UTF-8 compris : le Bloc-notes et Set-Content -Encoding UTF8 de
 * Windows PowerShell en mettent un, que JSON.parse refuse (« Unexpected token »).
 * Tout fichier JSON qu'un humain ou un autre outil peut écrire passe par ici.
 */
export function readJsonFile(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

/**
 * Lit un fichier JSON gardé par la borne. Absent : undefined. Illisible (abîmé, tronqué) : il est
 * mis de côté à son nom suivi de « .illisible-<date> », pour qu'un enregistrement ne l'écrase pas
 * (`setAside` : où il est) ; la lecture repart de rien.
 */
export function readKeptJson(file: string, now = new Date()): { value?: unknown; setAside?: string } {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  try {
    return { value: JSON.parse(text.replace(/^﻿/, '')) as unknown };
  } catch {
    const ext = path.extname(file);
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
    const setAside = path.join(path.dirname(file), `${path.basename(file, ext)}.illisible-${stamp}${ext}`);
    try {
      fs.renameSync(file, setAside);
      return { setAside };
    } catch {
      // Pas déplaçable (verrouillé) : signalé quand même ; l'enregistrement suivant échouera ou le remplacera.
      return { setAside: file };
    }
  }
}

export function readTextIfExists(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

export interface WriteReport {
  path: string;
  backup: string | undefined;
}

/**
 * Sauvegarde horodatée de l'ancien fichier (10 conservées), écriture atomique,
 * puis relecture pour vérifier que le disque contient bien ce qu'on a écrit.
 */
export function writeWithBackup(file: string, content: string, backupDir: string): WriteReport {
  let backup: string | undefined;
  if (fs.existsSync(file)) {
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backup = path.join(backupDir, `${path.basename(file)}.${stamp}`);
    fs.copyFileSync(file, backup);
    pruneBackups(backupDir, path.basename(file));
  }
  writeAtomic(file, content);
  if (fs.readFileSync(file, 'utf8') !== content) {
    throw new Error(t('Relecture de {file} : le contenu ne correspond pas à ce qui a été écrit.', { file }));
  }
  return { path: file, backup };
}

function writeAtomic(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

function pruneBackups(dir: string, base: string): void {
  const olds = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${base}.`))
    .sort();
  for (const f of olds.slice(0, Math.max(0, olds.length - BACKUPS_KEPT))) {
    fs.rmSync(path.join(dir, f));
  }
}
