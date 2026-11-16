// Où est installé Pinball FX sur ce PC : Steam (dossier lu dans le registre de
// l'utilisateur, sinon celui de la machine), puis Epic (manifestes de son lanceur).
// Rien n'est mémorisé : un jeu installé ou désinstallé depuis est vu au prochain appel.
// Pas installé : Steam (ou le lanceur d'Epic) est ouvert sur son installation ; Cyber Pinball ne
// télécharge ni le jeu ni ses tables (jeu commercial, lié au compte du joueur).

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  findPinballFx,
  pinballFxGetter,
  steamPinballFxDownloading,
  type PinballFxGetter,
  type PinballFxInstall,
} from '@cyberpinball/core';
import { allowAnyForeground, hkcuValue, hklmValue, type WindowInfo } from '@cyberpinball/win-displays';
import { realPinballFxSystem, type PinballFxSystem } from './pinballfx-launcher';

/** Démonstrations hors écran : un faux dossier de Steam, jamais celui du poste (et pas d'Epic). */
function simulatedSteam(): string | undefined {
  return process.env.CYBERPINBALL_STEAM_SIMULE || undefined;
}

function steamDir(): string | undefined {
  const simulated = simulatedSteam();
  if (simulated) return simulated;
  try {
    const user = hkcuValue('Software\Valve\Steam', 'SteamPath');
    if (typeof user === 'string' && user.trim()) return path.normalize(user);
    const machine = hklmValue('SOFTWARE\WOW6432Node\Valve\Steam', 'InstallPath');
    if (typeof machine === 'string' && machine.trim()) return path.normalize(machine);
  } catch {
    // Registre illisible : pas de Steam connu.
  }
  return undefined;
}

function epicDataDir(): string | undefined {
  if (simulatedSteam()) return undefined;
  return path.join(process.env.ProgramData ?? 'C:\ProgramData', 'Epic', 'EpicGamesLauncher');
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
  opts: { system?: PinballFxSystem; openUrl?: (url: string) => void; log?: (line: string) => void } = {},
): boolean {
  const sys = opts.system ?? realPinballFxSystem;
  const log = opts.log ?? ((line: string) => console.log(line));
  const before = new Set(sys.windows().map((w) => w.handle));
  if (!opts.system) allowAnyForeground();
  try {
    if (getter.store === 'steam') {
      const child = sys.launch(getter.file, getter.args);
      child.on('error', (e: Error) => log(`Pinball FX : Steam n'a pas pu être lancé (${e.message}).`)); // i18n-ignore : journal
    } else {
      (opts.openUrl ?? ((url: string) => void (require('electron') as typeof import('electron')).shell.openExternal(url)))(getter.url);
    }
  } catch (e) {
    log(`Pinball FX : boutique ${getter.store} impossible à ouvrir (${(e as Error).message}).`); // i18n-ignore : journal
    return false;
  }
  log(`Pinball FX : installation ouverte dans ${getter.store === 'steam' ? 'Steam' : 'Epic'}.`); // i18n-ignore : journal
  const t0 = sys.now();
  const poll = setInterval(() => {
    const shown = sys.windows().find((w) => !before.has(w.handle) && isStoreWindow(w));
    if (shown) sys.front(shown);
    if (shown || sys.now() - t0 > 20_000) clearInterval(poll);
  }, 500);
  poll.unref?.();
  return true;
}
