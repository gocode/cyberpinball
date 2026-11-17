// Lecture de Steam sur le disque, commune aux jeux de Zen Studios (Pinball FX, Pinball FX3) :
// fichiers KeyValues (« VDF »), bibliothèques (libraryfolders.vdf) et manifestes des jeux
// (appmanifest_<appid>.acf). Rien n'est écrit, rien n'est mémorisé.

import * as fs from 'node:fs';
import * as path from 'node:path';

export type VdfNode = { [key: string]: string | VdfNode };

/** Lecture des fichiers texte de Steam (KeyValues : "clé" "valeur" et "clé" { … }). */
export function parseVdf(text: string): VdfNode {
  const tokens: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])|\/\/[^\n]*/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[1] !== undefined) tokens.push(m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"'));
    else if (m[2]) tokens.push(m[2]);
  }
  let i = 0;
  const readObject = (): VdfNode => {
    const node: VdfNode = {};
    while (i < tokens.length) {
      const key = tokens[i++]!;
      if (key === '}') return node;
      if (key === '{') continue;
      const next = tokens[i++];
      if (next === undefined) break;
      node[key] = next === '{' ? readObject() : next;
    }
    return node;
  };
  return readObject();
}

function readText(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Bibliothèques de Steam (steamapps\libraryfolders.vdf), dossier principal compris. */
export function steamLibraries(steamDir: string): string[] {
  const libs = [steamDir];
  const text = readText(path.join(steamDir, 'steamapps', 'libraryfolders.vdf'));
  if (text) {
    const root = parseVdf(text);
    const folders = (root['libraryfolders'] ?? root['LibraryFolders']) as VdfNode | undefined;
    for (const value of Object.values(folders ?? {})) {
      const p = typeof value === 'string' ? value : typeof value['path'] === 'string' ? value['path'] : undefined;
      if (p && !libs.some((l) => path.resolve(l).toLowerCase() === path.resolve(p).toLowerCase())) libs.push(p);
    }
  }
  return libs;
}

/** AppState du manifeste d'un jeu dans une bibliothèque de Steam, s'il y en a un. */
function steamAppState(lib: string, appid: string): VdfNode | undefined {
  const text = readText(path.join(lib, 'steamapps', `appmanifest_${appid}.acf`));
  const state = text ? parseVdf(text)['AppState'] : undefined;
  return state && typeof state === 'object' ? state : undefined;
}

/**
 * Jeu entièrement installé : drapeau 4 (« FullyInstalled ») de StateFlags. Steam écrit le manifeste
 * dès le début du téléchargement ; sans ce contrôle, une table se lancerait sur un jeu à moitié
 * reçu. Un manifeste sans StateFlags (ancien format) vaut installé.
 */
function steamAppComplete(state: VdfNode): boolean {
  const flags = state['StateFlags'];
  if (typeof flags !== 'string') return true;
  const n = Number(flags);
  return Number.isFinite(n) && (n & 4) === 4;
}

/**
 * Dossier d'un jeu installé par Steam : manifeste complet dans l'une des bibliothèques, et dossier
 * steamapps\common\<installdir> présent. `installDir` sert quand le manifeste ne le dit pas.
 */
export function findSteamGame(steamDir: string, appid: string, installDir: string): string | undefined {
  for (const lib of steamLibraries(steamDir)) {
    const state = steamAppState(lib, appid);
    if (!state || !steamAppComplete(state)) continue;
    const dir = typeof state['installdir'] === 'string' ? state['installdir'] : installDir;
    const gameDir = path.join(lib, 'steamapps', 'common', dir);
    if (fs.existsSync(gameDir)) return gameDir;
  }
  return undefined;
}

/** Jeu en cours de téléchargement ou de mise à jour dans Steam (manifeste présent, jeu incomplet). */
export function steamGameDownloading(steamDir: string, appid: string): boolean {
  return steamLibraries(steamDir).some((lib) => {
    const state = steamAppState(lib, appid);
    return state !== undefined && !steamAppComplete(state);
  });
}

/** Installation par Steam : sa fenêtre « Installer », ou la page du jeu en boutique s'il n'est pas sur le compte. */
export function steamInstallUrl(appid: string): string {
  return `steam://install/${appid}`;
}
