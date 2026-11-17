// Ce qu'une table avait enregistré dans une autre installation de VPX, repris avec elle.
//
// Un script garde ses valeurs par SaveValue « stockage », « clé », valeur, et les relit par
// LoadValue : options choisies dans le menu de la table (difficulté, couleurs, volumes, nombre de
// billes du menu de service de VPW), tableau d'honneur des tables originales, crédits. VPX 10.7 et
// 10.8.0 les rangent toutes dans <VPX>\User\VPReg.stg, un stockage par nom choisi par le script ;
// VPX 10.8.1 dans <dossier de la table>\user\VPReg.stg (highscores.ts). Une table reprise sans
// elles repart des valeurs par défaut : « il a fallu tout régler de nouveau » (joueur venu de
// PinUP Popper, 17/11/2026). Ici, on lit dans le script les stockages qu'il emploie, et on les
// recopie de l'ancien fichier dans un VPReg.stg à elle, sans rien des autres tables.

import * as fs from 'node:fs';
import { writeCompoundFile, type CfbStorage, type CfbStream } from './cfbwrite';
import { scriptCode } from './vbscript';
import { CompoundFile, type DirEntry } from './vpxinfo';

/**
 * Stockages de VPReg.stg que le script emploie : premier argument de SaveValue et de LoadValue,
 * une chaîne (« "TheGoonies" ») ou une variable que le script règle sur une chaîne
 * (« Const cGameName = "gnr_300" »). Sans casse en double ; dans l'ordre du script.
 */
export function vpRegStorageNames(script: string): string[] {
  const code = scriptCode(script);
  const constants = new Map<string, string>();
  for (const m of code.matchAll(/^[ \t]*(?:(?:Public|Private|Dim)\s+)?(?:Const\s+)?([A-Za-z_]\w*)\s*=\s*"([^"\r\n]*)"/gim)) {
    const key = m[1]!.toLowerCase();
    if (!constants.has(key)) constants.set(key, m[2]!);
  }
  const out: string[] = [];
  const push = (name: string | undefined) => {
    const clean = name?.trim();
    if (clean && clean.length <= 31 && !out.some((o) => o.toLowerCase() === clean.toLowerCase())) out.push(clean);
  };
  for (const m of code.matchAll(/\b(?:SaveValue|LoadValue)\b\s*\(?\s*("([^"\r\n]*)"|[A-Za-z_]\w*(?:\.\w+)?)\s*,/gi)) {
    push(m[2] !== undefined ? m[2] : constants.get(m[1]!.toLowerCase()));
  }
  return out;
}

/** Stockages de ces noms (casse indifférente) dans un VPReg.stg ; undefined si le fichier est illisible. */
export function readVpRegStorages(file: string, names: string[]): CfbStorage[] | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r');
    const cfb = new CompoundFile(fd);
    const wanted = new Set(names.map((n) => n.toLowerCase()));
    const copy = (storage: DirEntry): CfbStorage => {
      const storages: CfbStorage[] = [];
      const streams: CfbStream[] = [];
      for (const e of cfb.children(storage)) {
        if (e.type === 1) storages.push(copy(e));
        else if (e.type === 2) streams.push({ name: e.name, data: cfb.stream(e) });
      }
      return { name: storage.name, storages, streams };
    };
    return cfb
      .children(cfb.entries[0]!)
      .filter((e) => e.type === 1 && wanted.has(e.name.toLowerCase()))
      .map(copy);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * VPReg.stg qui ne garde, de ces fichiers (le premier qui en a un l'emporte), que les stockages
 * de ces noms ; undefined quand aucun n'en a.
 */
export function extractVpReg(files: string[], names: string[]): Buffer | undefined {
  if (!names.length) return undefined;
  const taken = new Set<string>();
  const storages: CfbStorage[] = [];
  for (const file of files) {
    for (const s of readVpRegStorages(file, names) ?? []) {
      if (taken.has(s.name.toLowerCase())) continue;
      taken.add(s.name.toLowerCase());
      storages.push(s);
    }
  }
  return storages.length ? writeCompoundFile({ storages }) : undefined;
}
