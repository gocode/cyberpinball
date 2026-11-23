// Cadrage d'une table reprise d'une autre installation (PinUP Popper, PinballY, dossier de VPX) : celui que son VPX
// d'origine lui appliquait, figé dans le .ini de sa copie à l'ajout (packages/core/src/origin-framing.ts).
// L'installation d'origine est seulement lue (son VPinballX.ini, ou le registre avant VPX 10.8) : rien n'y est écrit.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  checkOtherVpx,
  findTableIni,
  iniMatchesVersion,
  knownTableInstallations,
  listInstallationTables,
  type InstallationTable,
  originIniCandidates,
  parsePovXml,
  planOriginFraming,
  readInfo,
  registryPlayerIni,
  vpxHasAutofit,
  vpxUsesIni,
  withOriginFraming,
  writeFileAtomic,
  type OriginFramingPlan,
  type OriginVpx,
  type PlayfieldOrientation,
} from '@cyberpinball/core';
import { installationHints } from './installation-hints';

/** Où VPX 10.7 et avant rangeaient leurs réglages (le cadrage compris). */
const VP10_PLAYER_KEY = 'HKCU\\Software\\Visual Pinball\\VP10\\Player';

const known = new Map<string, OriginVpx>();

function readText(file: string): string | undefined {
  try {
    // lecture entière : fichier de réglages de quelques dizaines de Ko
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Le VPX d'origine et ses réglages, lus une fois par exécutable. */
export function readOriginVpx(exe: string): OriginVpx {
  const id = path.resolve(exe).toLowerCase();
  const cached = known.get(id);
  if (cached) return cached;
  const checked = checkOtherVpx(exe, undefined);
  const version = checked.ok ? checked.version : undefined;
  let origin: OriginVpx = { exe, ...(version ? { version } : {}), ini: '' };
  if (!version || vpxUsesIni(version)) {
    const candidates = originIniCandidates(exe, version, process.env.APPDATA, path.join, path.dirname);
    for (const file of candidates) {
      const text = readText(file);
      if (text === undefined) continue;
      // À côté de l'exécutable, VPX 10.8.1 ne le lit que s'il est de sa version (sinon il l'a recopié ailleurs).
      if (vpxHasAutofit(version) && file === candidates[0] && !iniMatchesVersion(text, version)) continue;
      origin = { ...origin, source: file, ini: text };
      break;
    }
  } else if (process.platform === 'win32') {
    const query = spawnSync('reg', ['query', VP10_PLAYER_KEY], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (query.status === 0 && query.stdout) origin = { ...origin, source: VP10_PLAYER_KEY, ini: registryPlayerIni(query.stdout) };
  }
  known.set(id, origin);
  return origin;
}

/** Le cadrage que le VPX d'origine (`exe`) appliquait à `originVpx`, d'après ses réglages, son .ini et son .pov. */
export function originPlan(originVpx: string, exe: string, orientation: PlayfieldOrientation): OriginFramingPlan {
  const originIni = findTableIni(originVpx);
  const povText = readText(originVpx.replace(/\.[^.\\/]+$/, '') + '.pov');
  const pov = povText === undefined ? undefined : parsePovXml(povText);
  return planOriginFraming({ origin: readOriginVpx(exe), tableIni: originIni.exists ? readText(originIni.path) : undefined, pov, orientation });
}

/** Tables des autres installations du PC, lues une fois par session (« Point de vue » d'une table reprise avant). */
let installed: InstallationTable[] | undefined;

/**
 * La table d'une autre installation dont `tableFile` est la copie, et le VPX qui l'y jouait : même nom de fichier, ou
 * même taille et même titre. Pour les tables reprises avant que l'origine soit notée (0.2.4-essai.9) ; undefined :
 * introuvable, ou sans VPX connu.
 */
export function findOriginTable(tableFile: string, exclude: string[]): { vpx: string; exe: string } | undefined {
  installed ??= knownTableInstallations(['C:', 'D:', 'E:', 'F:'], exclude, installationHints()).flatMap((layout) => listInstallationTables(layout));
  const name = path.basename(tableFile).toLowerCase();
  let size = -1;
  try {
    size = fs.statSync(tableFile).size;
  } catch {
    return undefined;
  }
  const same = (vpx: string) => {
    if (path.resolve(vpx).toLowerCase() === path.resolve(tableFile).toLowerCase()) return false;
    if (path.basename(vpx).toLowerCase() === name) return true;
    try {
      return fs.statSync(vpx).size === size;
    } catch {
      return false;
    }
  };
  const found = installed.find((t) => t.vpxExe && same(t.vpx));
  return found ? { vpx: found.vpx, exe: found.vpxExe! } : undefined;
}

/**
 * Le cadrage de `originVpx` (la table dans l'installation d'origine, jouée par `exe`) appliqué à sa copie `tableFile` :
 * .ini de la copie réécrit si besoin, note dans son .info. Rien sans `orientation` (borne pas décrite : le sens ne se
 * vérifie pas). Le résultat, pour le journal.
 */
export function freezeOriginFraming(tableFile: string, infoFile: string, originVpx: string, exe: string, orientation: PlayfieldOrientation | undefined): OriginFramingPlan {
  if (!orientation) return { summary: 'borne pas décrite (assistant d’écrans) : cadrage d’origine non figé' }; // i18n-ignore : journal
  const plan = originPlan(originVpx, exe, orientation);
  const originIni = findTableIni(originVpx);
  if (!plan.note) return plan;
  const own = findTableIni(tableFile);
  // La copie de la table vient d'être faite : son .ini est celui de l'origine (ou absent). Un .ini qui en diffère a été
  // réglé depuis, ici : il est gardé tel quel.
  const current = own.exists ? readText(own.path) : undefined;
  const before = originIni.exists ? readText(originIni.path) : undefined;
  if (current !== undefined && before !== undefined && current !== before && current !== plan.ini) {
    return { summary: `${plan.summary} ; non appliqué, ${path.basename(own.path)} réglé depuis l'ajout` }; // i18n-ignore : journal
  }
  if (plan.ini !== undefined && plan.ini !== current) writeFileAtomic(own.path, plan.ini);
  writeFileAtomic(infoFile, JSON.stringify(withOriginFraming(readInfo(infoFile), plan.note), null, 2) + '\n');
  return plan;
}
