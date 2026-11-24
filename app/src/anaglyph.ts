// Lunettes 3D (packages/core/src/anaglyph.ts) : la table en relief avec des lunettes à filtres colorés.
//
// - Réglage : <données>\anaglyphe\reglage.json (activées ou non, lunettes, profondeur, couleurs, calibrage).
// - Chaque partie en relief reçoit une copie du fichier propre à la table (vide s'il n'en a pas),
//   complétée des réglages de la stéréo, dans <données>\anaglyphe\table-partie.ini, passée à VPX par
//   -TableIni. Ni le VPinballX.ini de la borne ni le fichier de la table ne sont modifiés ; après la
//   partie, ce que VPX a changé d'autre dans la copie (réglages de la table enregistrés en jeu) est
//   reporté dans le fichier de la table, sans les réglages de la stéréo.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { anaglyphGameSettings, applyVpxSettings, findTableIni, IniDocument, isAnaglyphKey, NVIDIA_3DVISION_OUTCOME_STATES, parseAnaglyphSetting, readTextIfExists, writeFileAtomic, type AnaglyphSetting, type Nvidia3dVisionOutcome, type VpxSetting } from '@cyberpinball/core';
import { writeIniSettings } from './vr';

const folder = (dataDir: string) => path.join(dataDir, 'anaglyphe');
const settingFile = (dataDir: string) => path.join(folder(dataDir), 'reglage.json');

export function readAnaglyph(dataDir: string): AnaglyphSetting {
  try {
    return parseAnaglyphSetting(JSON.parse(fs.readFileSync(settingFile(dataDir), 'utf8')));
  } catch {
    return parseAnaglyphSetting(undefined);
  }
}

export function writeAnaglyph(dataDir: string, setting: AnaglyphSetting): void {
  fs.mkdirSync(folder(dataDir), { recursive: true });
  writeFileAtomic(settingFile(dataDir), JSON.stringify(setting, null, 2) + '\n');
}

const outcomeFile = (dataDir: string) => path.join(folder(dataDir), 'nvidia-derniere-partie.json');

/** Bilan de la dernière partie en NVIDIA 3D Vision (journal de VPX) ; undefined : aucune encore, ou fichier illisible. */
export function readNvidiaOutcome(dataDir: string): Nvidia3dVisionOutcome | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(outcomeFile(dataDir), 'utf8')) as Partial<Nvidia3dVisionOutcome>;
    return typeof raw.line === 'string' && (NVIDIA_3DVISION_OUTCOME_STATES as readonly string[]).includes(raw.state as string) ? { state: raw.state!, line: raw.line } : undefined;
  } catch {
    return undefined;
  }
}

export function writeNvidiaOutcome(dataDir: string, outcome: Nvidia3dVisionOutcome): void {
  fs.mkdirSync(folder(dataDir), { recursive: true });
  writeFileAtomic(outcomeFile(dataDir), JSON.stringify(outcome, null, 2) + '\n');
}

/** Le journal de VPX au lancement d'une partie : son chemin et sa taille (0 : pas encore écrit). */
export interface VpxLogMark {
  file: string;
  size: number;
}

export function markVpxLog(file: string | undefined): VpxLogMark | undefined {
  if (!file) return undefined;
  try {
    return { file, size: fs.statSync(file).size };
  } catch {
    return { file, size: 0 };
  }
}

/** Plus que ce qu'une partie écrit au journal (quelques Mo au pire) : le début de la partie suffit au bilan. */
const LOG_READ_MAX = 8 * 1024 * 1024;

function readFrom(file: string, from: number): string {
  let fd: number | undefined;
  try {
    const size = fs.statSync(file).size;
    const length = Math.min(size - from, LOG_READ_MAX);
    if (length <= 0) return '';
    const buffer = Buffer.alloc(length);
    fd = fs.openSync(file, 'r');
    fs.readSync(fd, buffer, 0, length, from);
    return buffer.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Ce que VPX a écrit dans `file` depuis `since` (le lancement de la partie) ; undefined : pas de journal.
 * VPX ajoute à son journal et le fait tourner à 5 Mo (vpinball.log devient vpinball.1.log) : plus court
 * qu'au lancement, il a tourné pendant la partie, dont le début est alors à la fin de l'ancien.
 */
export function readVpxLogSince(file: string | undefined, since: VpxLogMark | undefined): string | undefined {
  if (!file) return undefined;
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return undefined;
  }
  if (!since || since.file !== file) return readFrom(file, 0);
  if (since.size <= size) return readFrom(file, since.size);
  const rolled = path.join(path.dirname(file), `${path.basename(file, path.extname(file))}.1${path.extname(file)}`);
  return readFrom(rolled, since.size) + '\n' + readFrom(file, 0);
}

/** La copie du fichier de la table passée à VPX pour une partie en relief. */
export interface AnaglyphGame {
  /** Le fichier propre à la table, à côté d'elle (il peut ne pas exister). */
  original: string;
  /** Il existait avant la partie. */
  existed: boolean;
  /** La copie passée à VPX par -TableIni. */
  file: string;
  /** Le texte écrit dans la copie (pour retrouver ce que VPX y a changé pendant la partie). */
  written: string;
  /** Ce qui a été posé (journal). */
  settings: VpxSetting[];
}

/** Prépare la partie en relief : `tableFile`, la table jouée ; `gameIni`, le VPinballX.ini que VPX recevra. */
export function prepareAnaglyphGame(dataDir: string, setting: AnaglyphSetting, tableFile: string, gameIni: string): AnaglyphGame {
  const tableIni = findTableIni(tableFile);
  const text = tableIni.exists ? readTextIfExists(tableIni.path) : '';
  const settings = anaglyphGameSettings(setting, text, readTextIfExists(gameIni));
  const doc = IniDocument.parse(text);
  applyVpxSettings(doc, settings);
  const written = doc.toString();
  const file = path.join(folder(dataDir), 'table-partie.ini');
  fs.mkdirSync(folder(dataDir), { recursive: true });
  writeFileAtomic(file, written);
  return { original: tableIni.path, existed: tableIni.exists, file, written, settings };
}

/**
 * Après la partie : ce que VPX a réécrit dans la copie (réglages de la table enregistrés en jeu) est
 * reporté dans le fichier de la table, sauf la stéréo posée par Cyber Pinball. Rend le nombre de réglages reportés.
 */
export function restoreAnaglyphGame(g: AnaglyphGame): number {
  const before = IniDocument.parse(g.written);
  const changed: VpxSetting[] = IniDocument.parse(readTextIfExists(g.file))
    .entries()
    .filter((e) => !isAnaglyphKey(e.section, e.key) && before.get(e.section, e.key) !== e.value)
    .map((e) => ({ section: e.section, key: e.key, value: e.value }));
  if (changed.length) writeIniSettings(g.original, changed);
  return changed.length;
}
