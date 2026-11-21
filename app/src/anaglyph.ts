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
import { anaglyphGameSettings, applyVpxSettings, findTableIni, IniDocument, isAnaglyphKey, parseAnaglyphSetting, readTextIfExists, writeFileAtomic, type AnaglyphSetting, type VpxSetting } from '@cyberpinball/core';
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
