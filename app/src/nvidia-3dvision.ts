// Lunettes actives NVIDIA 3D Vision (packages/core/src/nvidia3dvision.ts) : ce que la borne en a.
//
// - Pilote : nvapi64.dll (livrée avec le pilote NVIDIA, dans System32), lue par la sonde
//   sonde-nvidia-3dvision.ts dans un processus neuf à chaque fois : version du pilote, et la 3D
//   stéréoscopique globale activée ou non. Dans un même processus, NVAPI garde l'état lu la première
//   fois (essai sur la borne, 24/11/2026 : « coupée » lu par Cyber Pinball, « activée » par une sonde
//   neuve). La sonde active aussi la stéréo avant une partie en relief et la coupe après (stereoFor) :
//   active pendant une partie à plat, elle fait disparaître des éléments des tables.
// - Émetteur : les périphériques USB déjà relevés (vpx-ini.ts, usbDevices).
// - Écran : [Player] PlayfieldDisplay que la partie lira (fichier de la table, puis VPinballX.ini),
//   comparé à l'écran principal et aux écrans présents.
// - VPX : le mode direct n'est que dans le VPX corrigé en place (10.8.1-5436, série 7, vpx-corrige.ts).
//
// Relevé à l'ouverture de l'écran Lunettes 3D et par Santé de la borne, seulement quand les lunettes
// NVIDIA sont choisies ; gardé 30 s (NvAPI_Initialize prend quelques dizaines de ms).

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { screen } from 'electron';
import { IniDocument, isNvidia3dVisionEmitter, playfieldOnPrimary, readJsonFile, readTextIfExists, type Nvidia3dVisionFacts, type ObservedUsbDevice } from '@cyberpinball/core';
import { desktopDisplays, desktopPrimaryDisplay } from './offscreen';
import { vpxCorrigeInPlace } from './vpx-corrige';

/** Première série du VPX corrigé qui a le mode direct de 3D Vision (correctif 06). */
const NVIDIA_3DVISION_VPX_PATCH = 7;

type DriverFacts = Pick<Nvidia3dVisionFacts, 'nvapi' | 'driver' | 'stereo'>;

/** Ce que rend la sonde : le pilote, et le code de NvAPI_Stereo_Enable ou _Disable quand elle en a appelé une. */
export type NvapiProbe = DriverFacts & { change?: number };
type NvapiOp = 'read' | 'enable' | 'disable';

/** Au-delà, la sonde est arrêtée et rien n'est conclu (un pilote figé ne fige pas le front-end). */
const PROBE_TIMEOUT_MS = 8000;
const SONDE = path.join(__dirname, 'sonde-nvidia-3dvision.js');
const sondeEnv = () => ({ ...process.env, ELECTRON_RUN_AS_NODE: '1' });

/** La ligne JSON de la sonde ; pas de réponse lisible : pilote inconnu. */
function parseProbe(out: string, op: NvapiOp): NvapiProbe {
  try {
    const parsed = JSON.parse(out.trim().split(/\r?\n/).pop() ?? '') as NvapiProbe;
    if (typeof parsed.nvapi !== 'boolean') throw new Error('nvapi absent'); // i18n-ignore : journal
    return {
      nvapi: parsed.nvapi,
      ...(typeof parsed.driver === 'number' ? { driver: parsed.driver } : {}),
      ...(typeof parsed.stereo === 'boolean' ? { stereo: parsed.stereo } : {}),
      ...(typeof parsed.change === 'number' ? { change: parsed.change } : {}),
    };
  } catch (error) {
    console.log(`NVIDIA 3D Vision : sonde du pilote (${op}) sans réponse lisible (${(error as Error).message}).`); // i18n-ignore : journal
    return { nvapi: false };
  }
}

/** Le relevé des essais (CYBERPINBALL_NVIDIA_3DVISION) ; hors Windows : pas de pilote. */
function fixtureFacts(): DriverFacts | undefined {
  const fixture = process.env.CYBERPINBALL_NVIDIA_3DVISION;
  if (fixture) return readJsonFile(fixture) as DriverFacts;
  if (process.platform !== 'win32') return { nvapi: false };
  return undefined;
}

/** Le pilote NVIDIA : présent, sa version, la stéréo activée, lu par un processus neuf. Jamais d'exception. */
function readDriver(): DriverFacts {
  const fixed = fixtureFacts();
  if (fixed) return fixed;
  const run = spawnSync(process.execPath, [SONDE, 'read'], { windowsHide: true, env: sondeEnv(), encoding: 'utf8', timeout: PROBE_TIMEOUT_MS });
  return parseProbe(run.stdout ?? '', 'read');
}

/** La sonde, sans bloquer le front-end. */
function runProbe(op: NvapiOp): Promise<NvapiProbe> {
  const fixed = fixtureFacts();
  if (fixed) return Promise.resolve(fixed);
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(process.execPath, [SONDE, op], { windowsHide: true, env: sondeEnv(), stdio: ['ignore', 'pipe', 'ignore'] });
    const timer = setTimeout(() => child.kill(), PROBE_TIMEOUT_MS);
    child.stdout?.on('data', (data: Buffer) => (out += data.toString('utf8')));
    child.once('close', () => {
      clearTimeout(timer);
      resolve(parseProbe(out, op));
    });
    child.once('error', () => {
      clearTimeout(timer);
      resolve({ nvapi: false });
    });
  });
}

/** nvapi64.dll présente (pilote NVIDIA installé) : sans elle, aucune sonde n'est lancée. */
function nvapiPresent(): boolean {
  if (process.env.CYBERPINBALL_NVIDIA_3DVISION) return true;
  if (process.platform !== 'win32') return false;
  return fs.existsSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'nvapi64.dll'));
}

/**
 * Délai avant la relecture qui suit Stereo_Enable ou Stereo_Disable : 3D Fix Manager ouvert remet
 * aussitôt l'état de son bouton « Enable 3D » (essai sur la borne, 25/11/2026 : coupée à 09:45:52,
 * réactivée dans la seconde). Relue trop tôt, la stéréo paraîtrait changée.
 */
const SETTLE_MS = 1500;

export interface StereoChange {
  /** La stéréo lue avant ; undefined : inconnue (pilote 3D absent, pas de pilote NVIDIA). */
  before?: boolean;
  /** Le code de NvAPI_Stereo_Enable ou _Disable ; undefined : pas appelée (déjà dans l'état voulu). */
  change?: number;
  /** La stéréo relue par un processus neuf après SETTLE_MS. */
  after?: boolean;
}

/**
 * Met la 3D stéréoscopique globale du pilote dans l'état voulu : activée pour une partie en relief,
 * coupée pour toute autre partie. Ne fait rien sans pilote NVIDIA, ni quand la stéréo est inconnue
 * (pilote 3D absent) ou déjà dans l'état voulu. `settle` : relire après SETTLE_MS (sinon `after`
 * reprend ce que la sonde a lu juste après l'appel).
 */
export async function stereoFor(wanted: boolean, settle = true): Promise<StereoChange> {
  if (noStereoDriver || !nvapiPresent()) return {};
  const read = await runProbe('read');
  // Sans pilote 3D, il ne revient qu'après une installation et un redémarrage : plus de sonde avant les parties.
  if (!process.env.CYBERPINBALL_NVIDIA_3DVISION && (!read.nvapi || read.stereo === undefined)) noStereoDriver = true;
  if (!read.nvapi || read.stereo === undefined || read.stereo === wanted) {
    if (wanted && read.stereo === true) refused = false;
    return read.stereo === undefined ? {} : { before: read.stereo, after: read.stereo };
  }
  const changed = await runProbe(wanted ? 'enable' : 'disable');
  const result: StereoChange = { before: read.stereo, ...(changed.change !== undefined ? { change: changed.change } : {}) };
  if (!settle) return { ...result, ...(changed.stereo !== undefined ? { after: changed.stereo } : {}) };
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  const again = await runProbe('read');
  kept = undefined; // le relevé gardé ne vaut plus
  if (wanted) refused = again.stereo !== true;
  return { ...result, ...(again.stereo !== undefined ? { after: again.stereo } : {}) };
}

/** La dernière demande d'activation est restée sans effet (3D Fix Manager ouvert, bouton sur Off) ; effacé dès qu'elle passe. */
let refused = false;
/** Pas de pilote NVIDIA, ou pas de pilote 3D : lu une fois, jusqu'au prochain démarrage de Cyber Pinball. */
let noStereoDriver = false;

/** Relit le pilote sans bloquer le front-end (avant une partie) ; nvidia3dVisionFacts rend ensuite ce relevé. */
export async function refreshNvidiaDriver(): Promise<void> {
  const fixed = fixtureFacts();
  const facts: NvapiProbe = fixed ?? (nvapiPresent() ? await runProbe('read') : { nvapi: false });
  kept = { at: Date.now(), facts: { nvapi: facts.nvapi, ...(facts.driver !== undefined ? { driver: facts.driver } : {}), ...(facts.stereo !== undefined ? { stereo: facts.stereo } : {}) } };
}


let kept: { at: number; facts: DriverFacts } | undefined;
const KEEP_MS = 30_000;

export interface Nvidia3dVisionSources {
  /** Périphériques USB (vpx-ini.ts) ; undefined : illisibles. */
  usb(): ObservedUsbDevice[] | undefined;
  /**
   * Les fichiers de réglages que VPX lira pour la partie, du plus fort au plus faible : celui de la
   * table (ses valeurs l'emportent), puis le VPinballX.ini de la partie.
   */
  inis(): string[];
  /** VPX en place ; undefined : pas de VPX. */
  vpx(): { exe: string; version: string } | undefined;
}

/**
 * L'origine des écrans présents, en pixels physiques comme les écrit VPX ; undefined : inconnue
 * (aucun écran relevé, essais hors écran).
 */
function displayOrigins(): { x: number; y: number }[] | undefined {
  const displays = desktopDisplays();
  if (!displays.length) return undefined;
  return displays.map((d) => {
    const r = screen.dipToScreenRect(null, d.bounds);
    return { x: r.x, y: r.y };
  });
}

/** Le mode de l'écran principal (celui de la 3D), en pixels physiques ; undefined : pas relevé (essais hors écran). */
function primaryMode(): { width: number; height: number; hz: number } | undefined {
  const main = desktopPrimaryDisplay();
  if (!main || !main.displayFrequency) return undefined;
  return { width: Math.round(main.size.width * main.scaleFactor), height: Math.round(main.size.height * main.scaleFactor), hz: main.displayFrequency };
}

/** [Player] PlayfieldDisplay tel que VPX le lira : la première valeur posée, table d'abord. */
function playfieldDisplay(inis: string[]): string | undefined {
  for (const file of inis) {
    const value = IniDocument.parse(readTextIfExists(file)).get('Player', 'PlayfieldDisplay');
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Ce que la borne a pour les lunettes NVIDIA ; `fresh` : relit le pilote sans attendre les 30 s. */
export function nvidia3dVisionFacts(src: Nvidia3dVisionSources, fresh = false): Nvidia3dVisionFacts {
  if (fresh || !kept || Date.now() - kept.at > KEEP_MS) kept = { at: Date.now(), facts: readDriver() };
  const usb = src.usb();
  const primary = playfieldOnPrimary(playfieldDisplay(src.inis()), displayOrigins());
  const mode = primaryMode();
  const vpx = src.vpx();
  // Le mode direct n'est que dans le VPX corrigé, série 7 ou plus, réellement en place (pas seulement sa version).
  const patch = vpx ? vpxCorrigeInPlace(path.dirname(vpx.exe), vpx.version, path.join(__dirname, '..')) : undefined;
  return {
    ...kept.facts,
    ...(refused && kept.facts.stereo === false ? { stereoRefused: true } : {}),
    ...(usb ? { emitter: usb.some(isNvidia3dVisionEmitter) } : {}),
    ...(primary !== undefined ? { playfieldPrimary: primary } : {}),
    ...(mode ? { primaryMode: mode } : {}),
    ...(vpx ? { vpxSupported: patch !== undefined && patch >= NVIDIA_3DVISION_VPX_PATCH } : {}),
  };
}
