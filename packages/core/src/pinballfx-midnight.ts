// Détection Steam et identifiants de Pinball FX Midnight (anciennement Pinball M).
// Les cinq identifiants publiés par Zen sont des raccourcis, pas une liste de DLC ou de licences.
// https://steamcommunity.com/app/2337640/discussions/0/4040354495827792021/?ctp=4

import * as fs from 'node:fs';
import * as path from 'node:path';
import { findSteamGame, steamGameDownloading, steamInstallUrl } from './steam';
import type { PinballFxGetter } from './pinballfx';

export const PINBALLFX_MIDNIGHT_APP_ID = '2337640';

// Modes de jeu en alternance vérifiés séparément dans la documentation Midnight de Zen.
export const PINBALLFX_MIDNIGHT_PLAYER_MODES = ['Classic', 'Hotseat_2', 'Hotseat_3', 'Hotseat_4'] as const;
export type PinballFxMidnightMode = (typeof PINBALLFX_MIDNIGHT_PLAYER_MODES)[number];

export function isPinballFxMidnightMode(mode: string): mode is PinballFxMidnightMode {
  return PINBALLFX_MIDNIGHT_PLAYER_MODES.some((supported) => supported === mode);
}

export const PINBALLFX_MIDNIGHT_TABLES: ReadonlyMap<number, string> = new Map([
  [147, "Wrath of the Elder Gods Director's Cut"],
  [171, "Chucky's Killer Pinball"],
  [174, 'Dead by Daylight Pinball'],
  [175, 'The Thing Pinball'],
  [176, "Duke Nukem's Big Shot Pinball"],
]);

export interface PinballFxMidnightInstall {
  store: 'steam';
  launcher: string;
  gameDir: string;
}

export function isPinballFxMidnightId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function pinballFxMidnightSetup(steamDir?: string): { install?: PinballFxMidnightInstall; downloading: boolean; getter?: PinballFxGetter } {
  if (!steamDir) return { downloading: false };
  const launcher = path.join(steamDir, 'steam.exe');
  if (!fs.existsSync(launcher)) return { downloading: false };
  const gameDir = findSteamGame(steamDir, PINBALLFX_MIDNIGHT_APP_ID, 'Pinball FX Midnight');
  if (gameDir && fs.existsSync(path.join(gameDir, 'PinballM', 'Binaries', 'Win64', 'PinballM-Win64-Shipping.exe'))) {
    return { downloading: false, install: { store: 'steam', launcher, gameDir } };
  }
  return {
    downloading: steamGameDownloading(steamDir, PINBALLFX_MIDNIGHT_APP_ID),
    getter: { store: 'steam', file: launcher, args: [steamInstallUrl(PINBALLFX_MIDNIGHT_APP_ID)] },
  };
}

export function pinballFxMidnightCommand(install: PinballFxMidnightInstall, table: number, mode: PinballFxMidnightMode = 'Classic'): { file: string; args: string[] } {
  if (!isPinballFxMidnightId(table)) throw new RangeError('Invalid Pinball FX Midnight table ID');
  if (!isPinballFxMidnightMode(mode)) throw new RangeError('Invalid Pinball FX Midnight game mode');
  return { file: install.launcher, args: ['-applaunch', PINBALLFX_MIDNIGHT_APP_ID, '-Table', String(table), '-GameMode', mode] };
}
