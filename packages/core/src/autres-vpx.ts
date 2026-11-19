// Autres versions de VPX : un VPX déjà installé sur le PC (10.8.0, 10.7…), choisi table par table.
// Cyber Pinball ne l'installe jamais : VPinMAME et B2S Server, dont ces versions ont besoin,
// s'inscrivent dans le registre de Windows ; c'est l'installation du joueur, avec ses propres réglages.
//
// Pour une table jouée ainsi, Cyber Pinball n'est qu'un lanceur : l'exécutable avec la table (-Play), son
// VPinballX.ini à lui (écrans, fronton, DMD réglés pour lui), puis le retour à la roue. Rien de ce que
// Cyber Pinball fait pour son VPX 10.8.1 en mode plugins (OTHER_VPX_LIMITS) ; jamais une écriture dans le
// dossier de cet autre VPX.
//
// La liste est dans <données>\autres-vpx.json ; le choix d'une table dans son .info (CyberPinball.vpx), où
// il suit la table. Un choix dont le VPX n'est plus dans la liste ne compte plus : la table revient au VPX
// de Cyber Pinball.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { readWholeFile } from './boundedread';
import { samePath } from './fileops';
import { t, tLater, type LaterText } from './i18n';
import { peFileVersion } from './vc-runtime';

/** Un autre VPX, déjà installé sur le PC. */
export interface OtherVpx {
  /** Identifiant stable, gardé dans le .info des tables (« vpx-10.8.0-2051 »). */
  id: string;
  /** Chemin de l'exécutable (VPinballX64.exe, VPinballX_GL64.exe…). */
  exe: string;
  /** Version du fichier, « 10.8.0.2051 ». */
  version: string;
}

/** Fichier de la liste, dans le dossier des données. */
export const OTHER_VPX_FILE = 'autres-vpx.json';

/** Ce que Cyber Pinball ne fait pas pour une table jouée avec un autre VPX (fiche, Menu système > Borne). */
export const OTHER_VPX_LIMITS: LaterText[] = [
  tLater('réalité virtuelle'),
  tLater('réglage de l’affichage en partie'),
  tLater('partie entre amis'),
  tLater('Vision 3D'),
  tLater('réglages de VPX de Cyber Pinball (écrans, DMD réel, boutons)'),
  tLater('préparation des PuP-Packs'),
];

/** « 10.8.0 » : les trois premiers nombres de la version. */
export function otherVpxShortVersion(version: string): string {
  return version.split('.').slice(0, 3).join('.');
}

/** « VPX 10.8.0 » : ce que montrent la fiche, l'installation d'une table et le menu système. */
export function otherVpxLabel(v: Pick<OtherVpx, 'version'>): string {
  return `VPX ${otherVpxShortVersion(v.version)}`; // i18n-ignore : nom de logiciel et numéro de version
}

export function readOtherVpx(dataDir: string): OtherVpx[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, OTHER_VPX_FILE), 'utf8')) as { versions?: unknown };
    if (!Array.isArray(parsed.versions)) return [];
    return parsed.versions.filter(
      (v): v is OtherVpx => !!v && typeof v === 'object' && ['id', 'exe', 'version'].every((k) => typeof (v as Record<string, unknown>)[k] === 'string' && (v as Record<string, string>)[k]!.length > 0),
    );
  } catch {
    return [];
  }
}

export function writeOtherVpx(dataDir: string, list: OtherVpx[]): void {
  writeFileAtomic(path.join(dataDir, OTHER_VPX_FILE), JSON.stringify({ versions: list }, null, 2) + '\n');
}

/** Ce que dit un exécutable proposé comme autre VPX : sa version, ou pourquoi il ne convient pas. */
export type OtherVpxCheck = { ok: true; version: string } | { ok: false; reason: string };

/**
 * Un exécutable convient-il comme autre VPX ? Un VPinballX*.exe dont la version est celle de VPX 10, autre que
 * celle de Cyber Pinball (`ownVersion`, « 10.8.1-5436 ») : la même version n'apporterait rien et ferait perdre
 * à la table tout ce que Cyber Pinball fait pour elle. `read` : le contenu du fichier (les essais le simulent).
 */
export function checkOtherVpx(exe: string, ownVersion: string | undefined, read: (file: string) => Buffer = (f) => readWholeFile(f, 512 * 1024 ** 2)): OtherVpxCheck {
  if (!/^vpinballx.*\.exe$/i.test(path.basename(exe))) return { ok: false, reason: t('Ce n’est pas l’exécutable de VPX (VPinballX64.exe, VPinballX.exe…).') };
  let version: string | undefined;
  try {
    version = peFileVersion(read(exe));
  } catch {
    return { ok: false, reason: t('Fichier illisible.') };
  }
  if (!version || !/^10\.\d+\.\d+/.test(version)) return { ok: false, reason: t('Version de VPX introuvable dans ce fichier : seul VPX 10 se lance depuis Cyber Pinball.') };
  if (ownVersion && sameVpxVersion(version, ownVersion)) {
    return { ok: false, reason: t('C’est la version que Cyber Pinball utilise déjà : ses tables n’y perdraient que les fonctions de Cyber Pinball.') };
  }
  return { ok: true, version };
}

/** « 10.8.1.5436 » et « 10.8.1-5436 » sont la même version (fichier, manifeste de Cyber Pinball). */
export function sameVpxVersion(a: string, b: string): boolean {
  const parts = (v: string) => v.split(/[.\-]/).filter((p) => /^\d+$/.test(p)).map(Number);
  const pa = parts(a);
  const pb = parts(b);
  const n = Math.min(pa.length, pb.length, 4);
  return n >= 3 && pa.slice(0, n).every((x, i) => x === pb[i]);
}

/** La liste avec ce VPX ajouté (un exécutable déjà présent est mis à jour, pas doublé), et son identifiant. */
export function addOtherVpx(list: OtherVpx[], exe: string, version: string): { list: OtherVpx[]; id: string } {
  const known = list.find((v) => samePath(v.exe, exe));
  if (known) return { list: list.map((v) => (v === known ? { ...v, version } : v)), id: known.id };
  const base = `vpx-${version.replace(/\./g, '-').replace(/^(\d+)-(\d+)-(\d+)-?/, '$1.$2.$3-').replace(/-$/, '')}`;
  let id = base;
  for (let n = 2; list.some((v) => v.id === id); n++) id = `${base}-${n}`;
  return { list: [...list, { id, exe: path.resolve(exe), version }], id };
}

export function removeOtherVpx(list: OtherVpx[], id: string): OtherVpx[] {
  return list.filter((v) => v.id !== id);
}

// ---------------------------------------------------------------------------
// Choix d'une table (.info, CyberPinball.vpx)

/** Identifiant de l'autre VPX choisi pour cette table, tel qu'écrit ; undefined : le VPX de Cyber Pinball. */
export function vpxChoiceOf(info: { [key: string]: unknown }): string | undefined {
  const own = info.CyberPinball as { vpx?: unknown } | undefined;
  return typeof own?.vpx === 'string' && own.vpx ? own.vpx : undefined;
}

/** Le .info avec ce choix (undefined : le VPX de Cyber Pinball), les autres champs conservés. */
export function withVpxChoice<T extends { [key: string]: unknown }>(info: T, id: string | undefined): T {
  const own: Record<string, unknown> = { ...(info.CyberPinball as Record<string, unknown> | undefined) };
  if (id) own.vpx = id;
  else delete own.vpx;
  const next: Record<string, unknown> = { ...info };
  if (Object.keys(own).length) next.CyberPinball = own;
  else delete next.CyberPinball;
  return next as T;
}

/** L'autre VPX avec lequel jouer cette table : celui qu'elle a choisi, s'il est encore dans la liste. */
export function otherVpxFor(info: { [key: string]: unknown }, list: OtherVpx[]): OtherVpx | undefined {
  const id = vpxChoiceOf(info);
  return id ? list.find((v) => v.id === id) : undefined;
}

/**
 * L'autre VPX de la liste qui correspond à l'exécutable avec lequel une autre installation jouait la table
 * (PinUP Popper : émulateur et ALTEXE de la table) : le même fichier, sinon la même version. undefined : le
 * VPX de Cyber Pinball (même version que lui, ou version absente de la liste : rien n'est proposé).
 */
export function matchOtherVpx(list: OtherVpx[], exe: string, version: string | undefined): OtherVpx | undefined {
  return list.find((v) => samePath(v.exe, exe)) ?? (version ? list.find((v) => v.version === version) : undefined);
}

/**
 * Pourquoi une partie de cette table ne se lance pas avec son autre VPX, ou undefined. `exists` : l'exécutable est
 * encore là ; `display` : réglage de l'affichage en partie ; `friends` : partie entre amis.
 */
export function otherVpxRefusal(v: OtherVpx, game: { exists: boolean; display?: boolean; friends?: boolean }): { title: string; lines: string[] } | undefined {
  const vpx = otherVpxLabel(v);
  const back = t('Start ou Exit : revenir au front-end.');
  if (!game.exists) {
    return {
      title: t('{vpx} introuvable', { vpx }),
      lines: [v.exe, t('Il a été déplacé ou désinstallé. Pour jouer cette table avec le VPX de Cyber Pinball : Gérer la table, puis « Jouée avec {vpx} ».', { vpx }), back],
    };
  }
  if (game.display) {
    return {
      title: t('Réglage de l’affichage impossible avec {vpx}', { vpx }),
      lines: [t('Cette table est jouée avec {vpx}, réglé hors de Cyber Pinball : son affichage se règle dans ce VPX.', { vpx }), back],
    };
  }
  if (game.friends) {
    return {
      title: t('Partie entre amis impossible avec {vpx}', { vpx }),
      lines: [t('Une partie entre amis se joue avec le VPX de Cyber Pinball : Gérer la table, puis « Jouée avec {vpx} », pour le choisir.', { vpx }), back],
    };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Exécutables d'une installation

/** Noms de l'exécutable de VPX, dans l'ordre où un lanceur les prend quand rien d'autre n'est dit. */
const DEFAULT_EXE_NAMES = ['VPinballX64.exe', 'VPinballX.exe', 'VPinballX_GL64.exe', 'VPinballX_GL.exe'];

/** Exécutables de VPX d'un dossier (VPinballX*.exe), le plus courant en premier. */
export function vpxExesIn(dir: string): string[] {
  let names: string[];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && /^vpinballx.*\.exe$/i.test(d.name))
      .map((d) => d.name);
  } catch {
    return [];
  }
  const rank = (n: string) => {
    const i = DEFAULT_EXE_NAMES.findIndex((d) => d.toLowerCase() === n.toLowerCase());
    return i < 0 ? DEFAULT_EXE_NAMES.length : i;
  };
  return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((n) => path.join(dir, n));
}

/**
 * L'exécutable avec lequel PinUP Popper lance une table : son ALTEXE (un nom de fichier du dossier de
 * l'émulateur, avec ou sans .exe), sinon l'exécutable habituel de ce dossier. Un ALTEXE qui ne nomme aucun
 * fichier du dossier est propre au script de lancement de cette installation : undefined, rien n'est deviné.
 */
export function popperGameExe(emulatorDir: string | null | undefined, altExe: string | null | undefined): string | undefined {
  const dir = emulatorDir?.trim();
  if (!dir || !path.isAbsolute(dir)) return undefined;
  const alt = altExe?.trim();
  if (alt) {
    for (const name of [alt, `${alt}.exe`]) {
      if (path.basename(name) !== name || !/\.exe$/i.test(name)) continue;
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).isFile()) return file;
      } catch {
        // Pas ce nom.
      }
    }
    return undefined;
  }
  return vpxExesIn(dir)[0];
}
