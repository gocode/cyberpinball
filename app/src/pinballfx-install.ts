// Où est installé Pinball FX sur ce PC : Steam (dossier lu dans le registre de
// l'utilisateur, sinon celui de la machine), puis Epic (manifestes de son lanceur).
// Rien n'est mémorisé : un jeu installé ou désinstallé depuis est vu au prochain appel. Seule
// exception : le dossier de Pinball FX3 choisi à la main (pinballfx3-folder.ts), vérifié à chaque appel.
// Pas installé : Steam (ou le lanceur d'Epic) est ouvert sur son installation ; Cyber Pinball ne
// télécharge ni le jeu ni ses tables (jeu commercial, lié au compte du joueur).

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  chosenPinballFx3,
  findPinballFx,
  findSteamPinballFx3,
  pickPinballFx3Install,
  type PinballFx3Chosen,
  pinballFx3Getter,
  pinballFxGetter,
  pinballFxMidnightSetup,
  steamPinballFx3Downloading,
  steamPinballFxDownloading,
  type PinballFx3Install,
  type PinballFxGetter,
  type PinballFxInstall,
  type ZenGameKey,
} from '@cyberpinball/core';
import { allowAnyForeground, hkcuValue, hklmValue, type WindowInfo } from '@cyberpinball/win-displays';
import { realPinballFxSystem, type PinballFxSystem } from './pinballfx-launcher';

/** Démonstrations hors écran : un faux dossier de Steam, jamais celui du poste (et pas d'Epic). */
function simulatedSteam(): string | undefined {
  return process.env.CYBERPINBALL_STEAM_SIMULE || undefined;
}

/**
 * Dossier de Steam : celui que le registre de l'utilisateur donne (SteamPath), puis celui de la
 * machine (InstallPath), puis l'emplacement par défaut ; le premier qui contient steam.exe. Une
 * valeur du registre périmée (Steam déplacé) ne cache donc pas un Steam bien installé.
 */
function steamDir(): string | undefined {
  const simulated = simulatedSteam();
  if (simulated) return simulated;
  const candidates: string[] = [];
  const read = (get: () => unknown): void => {
    try {
      const value = get();
      if (typeof value === 'string' && value.trim()) candidates.push(path.normalize(value.trim()));
    } catch {
      // Registre illisible : on passe au suivant.
    }
  };
  read(() => hkcuValue('Software\\Valve\\Steam', 'SteamPath'));
  read(() => hklmValue('SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'));
  read(() => hklmValue('SOFTWARE\\Valve\\Steam', 'InstallPath'));
  candidates.push(path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Steam'));
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'steam.exe'))) ?? candidates[0];
}

function epicDataDir(): string | undefined {
  if (simulatedSteam()) return undefined;
  return path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher');
}

export function detectPinballFx(): PinballFxInstall | undefined {
  const steam = steamDir();
  const epic = epicDataDir();
  return findPinballFx({
    ...(steam ? { steamDir: steam } : {}),
    ...(epic ? { epicManifestsDir: path.join(epic, 'Data', 'Manifests') } : {}),
  });
}

/** Pinball FX sur ce PC : installé, en cours de téléchargement, ou comment l'obtenir. */
export interface PinballFxSetup {
  install?: PinballFxInstall;
  /** Steam le télécharge (ou le met à jour) : pas encore jouable. */
  downloading: boolean;
  /** Pas installé : la boutique à ouvrir ; aucune (ni Steam ni Epic) : undefined. */
  getter?: PinballFxGetter;
}

export function pinballFxSetup(): PinballFxSetup {
  const install = detectPinballFx();
  if (install) return { install, downloading: false };
  const steam = steamDir();
  const epic = epicDataDir();
  const getter = pinballFxGetter({ ...(steam ? { steamDir: steam } : {}), epic: !!epic && fs.existsSync(epic) });
  return { downloading: !!steam && steamPinballFxDownloading(steam), ...(getter ? { getter } : {}) };
}

/**
 * Pinball FX3 sur ce PC : le dossier du jeu choisi à la main (dossier des données `dataDir`), s'il
 * convient et n'est pas celui de Steam, sinon le jeu installé par Steam (pinballfx3-folder.ts).
 */
export function detectPinballFx3(dataDir?: string): PinballFx3Install | undefined {
  const steam = steamDir();
  return pickPinballFx3Install(steam ? findSteamPinballFx3(steam) : undefined, dataDir ? chosenPinballFx3(dataDir) : undefined);
}

/** Pinball FX3 sur ce PC : installé (Steam ou dossier choisi), en cours de téléchargement, ou Steam à ouvrir sur son installation. */
export function pinballFx3Setup(dataDir?: string): { install?: PinballFx3Install; downloading: boolean; getter?: PinballFxGetter; chosen?: PinballFx3Chosen; steamDir?: string } {
  const steam = steamDir();
  const steamInstall = steam ? findSteamPinballFx3(steam) : undefined;
  const chosen = dataDir ? chosenPinballFx3(dataDir) : undefined;
  const extra = { ...(chosen ? { chosen } : {}), ...(steamInstall ? { steamDir: steamInstall.gameDir } : {}) };
  const install = pickPinballFx3Install(steamInstall, chosen);
  if (install) return { install, downloading: false, ...extra };
  const getter = pinballFx3Getter(steam);
  return { downloading: !!steam && steamPinballFx3Downloading(steam), ...(getter ? { getter } : {}), ...extra };
}

/** Un jeu de Zen sur ce PC, quel qu'il soit : installé (et par quelle boutique), en téléchargement, ou comment l'obtenir. */
export interface ZenSetup {
  /** `tablesDir` : Pinball FX3, dossier de ses fichiers de tables ; 'folder' : dossier choisi à la main. */
  install?: { store: 'steam' | 'epic' | 'folder'; tablesDir?: string; gameDir?: string };
  downloading: boolean;
  getter?: PinballFxGetter;
  /** Pinball FX3 : le dossier du jeu choisi à la main, s'il y en a un, et ce qu'il vaut. */
  chosen?: PinballFx3Chosen;
  /** Pinball FX3 : le dossier du jeu installé par Steam, s'il y en a un. */
  steamDir?: string;
}

export function zenSetup(game: ZenGameKey, dataDir?: string): ZenSetup {
  if (game === 'pinballfxmidnight') return pinballFxMidnightSetup(steamDir());
  return game === 'pinballfx' ? pinballFxSetup() : pinballFx3Setup(dataDir);
}

export function detectPinballFxMidnight() {
  return pinballFxMidnightSetup(steamDir()).install;
}

/** Fenêtre de la boutique : Steam (sa fenêtre « Installer », sa connexion) ou le lanceur d'Epic. */
export function isStoreWindow(w: Pick<WindowInfo, 'title' | 'visible'>): boolean {
  return w.visible && /steam|pinball fx|epic games/i.test(w.title);
}

/**
 * Ouvre la boutique sur Pinball FX et amène sa fenêtre devant Cyber Pinball : la première fenêtre
 * de Steam ou d'Epic parue dans les 20 s (celles déjà ouvertes ne comptent pas). Rend false si la
 * boutique n'a pas pu être lancée.
 */
export function openPinballFxStore(
  getter: PinballFxGetter,
  opts: { system?: PinballFxSystem; openUrl?: (url: string) => void; log?: (line: string) => void; name?: string } = {},
): boolean {
  const sys = opts.system ?? realPinballFxSystem;
  const name = opts.name ?? 'Pinball FX';
  const log = opts.log ?? ((line: string) => console.log(line));
  const before = new Set(sys.windows().map((w) => w.handle));
  if (!opts.system) allowAnyForeground();
  try {
    if (getter.store === 'steam') {
      const child = sys.launch(getter.file, getter.args);
      child.on('error', (e: Error) => log(`${name} : Steam n'a pas pu être lancé (${e.message}).`)); // i18n-ignore : journal
    } else {
      (opts.openUrl ?? ((url: string) => void (require('electron') as typeof import('electron')).shell.openExternal(url)))(getter.url);
    }
  } catch (e) {
    log(`${name} : boutique ${getter.store} impossible à ouvrir (${(e as Error).message}).`); // i18n-ignore : journal
    return false;
  }
  log(`${name} : installation ouverte dans ${getter.store === 'steam' ? 'Steam' : 'Epic'}.`); // i18n-ignore : journal
  const t0 = sys.now();
  const poll = setInterval(() => {
    const shown = sys.windows().find((w) => !before.has(w.handle) && isStoreWindow(w));
    if (shown) sys.front(shown);
    if (shown || sys.now() - t0 > 20_000) clearInterval(poll);
  }, 500);
  poll.unref?.();
  return true;
}
