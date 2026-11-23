// Options de lancement des VPX classiques (10.8.0 et précédents). Dans main.cpp à la révision
// 28dd6c3, -Play ne masque pas l’éditeur ; -ExtMinimized le masque en gardant la pause de VPX.
// Aucun réglage ni plugin du VPX de Cyber Pinball n’est imposé à ces versions.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { findPovView, findTableIni, hasOwnCabinetView, IniDocument, writeFileAtomic } from '@cyberpinball/core';

export function classicVpx(version: string | undefined): boolean {
  const parts = version?.split(/[.-]/).map(Number);
  return parts?.[0] === 10 && (parts[1]! < 8 || (parts[1] === 8 && parts[2] === 0));
}

/**
 * VPX 10.8.0 ignore le .pov si le .ini porte ne serait-ce qu’une rotation de caméra.
 * Sans vue réellement réglée, reprendre le POV dans un INI distinct pour cette version.
 * Le fichier de la table et les réglages du VPX installé restent intacts ; une vue propre reste prioritaire.
 */
export function prepareClassicPov(version: string, table: string, dataDir: string): string | undefined {
  if (!/^10[.]8[.]0(?:[.-]|$)/.test(version)) return undefined;
  const ini = findTableIni(table);
  // lecture entière : petit fichier INI de réglages de la table.
  const doc = IniDocument.parse(ini.exists ? fs.readFileSync(ini.path, 'utf8') : '');
  if (hasOwnCabinetView(doc)) return undefined;
  const pov = findPovView(table);
  if (!pov) return undefined;
  const id = createHash('sha256').update(path.resolve(table).toLowerCase()).update(doc.toString()).update(JSON.stringify(pov.values)).digest('hex');
  const file = path.join(dataDir, 'vpx-classique-pov', version.replace(/[^0-9.-]/g, '_'), id + '.ini');
  if (!fs.existsSync(file)) {
    for (const e of doc.entries()) if (e.section.toLowerCase() === 'tableoverride' && /^ViewCab/i.test(e.key)) doc.remove(e.section, e.key);
    for (const value of pov.values) doc.set('TableOverride', value.key, value.value);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomic(file, doc.toString());
  }
  return file;
}

export interface VpxLaunchArguments {
  version?: string;
  ini?: string;
  tableIni?: string;
  display?: boolean;
  table: string;
}

export function vpxLaunchArguments(opts: VpxLaunchArguments): string[] {
  const classic = classicVpx(opts.version);
  return [...(classic ? ['-ExtMinimized'] : []), ...(opts.ini ? ['-Ini', opts.ini] : []), ...(opts.tableIni ? ['-TableIni', opts.tableIni] : []), opts.display ? '-PovEdit' : '-Play', opts.table];
}
