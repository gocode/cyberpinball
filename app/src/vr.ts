// Réalité virtuelle (packages/core/src/vr.ts) : le réglage du joueur (Menu système > Borne >
// Réalité virtuelle), le runtime du casque, et le VPinballX.ini d'une partie dans le casque.
// Gardé dans <données>\vr\ : reglage.json (le choix ; illisible ou absent : désactivée) et
// VPinballX.ini (celui de la dernière partie en VR, d'où viennent orientation et place de la table).
// Le VPinballX.ini de la borne n'est jamais modifié.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyVpxSettings,
  formatChanges,
  IniDocument,
  planVrIni,
  readTextIfExists,
  readVpxScript,
  readVpxBackglassDisplays,
  tableUsesPupCapture,
  vrNeedsVpxBackglass,
  samePath,
  tableHasVrRoom,
  tableIniRefusedInStereo,
  vrStereoFxaa,
  vrCarriedSettings,
  windowsVk,
  vrReadiness,
  writeFileAtomic,
  type VpxSetting,
  type VrMode,
  type VrReadiness,
} from '@cyberpinball/core';
import { foregroundWindow, openXrActiveRuntime, tapKey } from '@cyberpinball/win-displays';

const folder = (dataDir: string) => path.join(dataDir, 'vr');
const settingFile = (dataDir: string) => path.join(folder(dataDir), 'reglage.json');

/** VPinballX.ini de la dernière partie en VR. */
export function vrIniFile(dataDir: string): string {
  return path.join(folder(dataDir), 'VPinballX.ini');
}

export function readVrMode(dataDir: string): VrMode {
  try {
    return (JSON.parse(fs.readFileSync(settingFile(dataDir), 'utf8')) as { mode?: unknown }).mode === 'auto' ? 'auto' : 'off';
  } catch {
    return 'off';
  }
}

export function writeVrMode(dataDir: string, mode: VrMode): void {
  writeVrSetting(dataDir, { mode });
}

/**
 * « Recopie sur le playfield » : la vue d'un œil du casque sur l'écran du plateau pendant une partie
 * (vr.ts, VR_NO_MIRROR). Éteinte par défaut : VPX ne sait pas la tourner en portrait, et la copier en 4K
 * à chaque image prend de la carte graphique pour une image que les spectateurs voient couchée.
 */
export function readVrMirror(dataDir: string): boolean {
  try {
    return (JSON.parse(fs.readFileSync(settingFile(dataDir), 'utf8')) as { mirror?: unknown }).mirror === true;
  } catch {
    return false;
  }
}

export function writeVrMirror(dataDir: string, mirror: boolean): void {
  writeVrSetting(dataDir, { mirror });
}

/**
 * Un réglage de la VR écrit sans perdre les autres (mode, recopie). L'ancien « autoRecal » (option « Recalage
 * automatique », retirée le 13 novembre 2026 : l'ancrage sur la limite du Quest la remplace) est ignoré à la lecture
 * et oublié ici.
 */
function writeVrSetting(dataDir: string, patch: { mode?: VrMode; mirror?: boolean }): void {
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(fs.readFileSync(settingFile(dataDir), 'utf8')) as Record<string, unknown>;
  } catch {
    // Pas encore de réglage.
  }
  fs.mkdirSync(folder(dataDir), { recursive: true });
  delete current.autoRecal;
  writeFileAtomic(settingFile(dataDir), JSON.stringify({ ...current, ...patch }, null, 2) + '\n');
}

/** Le runtime OpenXR actif et son manifeste, lus maintenant (registre, sans réveiller le casque). */
export function probeVr(): VrReadiness {
  const manifest = openXrActiveRuntime();
  let text: string | undefined;
  if (manifest) {
    try {
      text = fs.readFileSync(manifest, 'utf8');
    } catch {
      text = undefined;
    }
  }
  return vrReadiness({ manifest, text });
}

export interface VrGame {
  /** Le VPinballX.ini à passer à VPX par -Ini. */
  ini: string;
  /** L'INI propre à la table, neutralisé pour le casque : sa copie à passer par -TableIni (prepareVrTableIni). */
  tableIni?: VrTableIni;
  /** La table a sa propre pièce VR. */
  room: boolean;
  /** Flashers de la table qui montrent le fronton en VR (undefined : table illisible). */
  backglassDisplays: number | undefined;
  /** Fronton posé par VPX dans la scène ([PlayerVR] AddBackglass) : sans pièce VR, ou une pièce sans fronton. */
  addBackglass: boolean;
  /** Une ligne par clé écrite, pour le journal. */
  changes: string[];
  /**
   * L'INI de départ (celui de la borne, ou du double) : casque pas prêt, la partie se joue sur les écrans
   * avec `ini`, qui doit garder ses fenêtres (screensFallbackGaps, contrôlé au journal).
   */
  baseText: string;
  /** Réglages de la VR repris de la partie précédente. */
  carried: number;
}

/**
 * Prépare la partie en VR : `baseIni`, l'INI que VPX aurait reçu (celui de la borne, ou celui du
 * double d'une partie entre amis). Le double est déjà une copie à part : il est réécrit sur place
 * (`inPlace`). Sinon, l'INI de la partie est <données>\vr\VPinballX.ini.
 */
export function prepareVrGame(opts: { dataDir: string; baseIni: string; tableFile: string; inPlace: boolean; mirror?: boolean }): VrGame {
  const target = opts.inPlace ? opts.baseIni : vrIniFile(opts.dataDir);
  const previous = readTextIfExists(vrIniFile(opts.dataDir)) || undefined;
  const script = readVpxScript(opts.tableFile);
  const room = tableHasVrRoom(script);
  // Une pièce VR dont le fronton passe par la capture de PuP, sans flasher du fronton, le laisserait
  // vide (essai du 10 novembre 2026, The Matrix : on voyait à travers) : VPX pose alors le sien, que
  // PuP, B2S ou le fond du plugin de la pause remplissent.
  const backglassDisplays = readVpxBackglassDisplays(opts.tableFile);
  const addBackglass = vrNeedsVpxBackglass({ room, backglassDisplays, pupCapture: tableUsesPupCapture(script) });
  const base = readTextIfExists(opts.baseIni);
  const plan = planVrIni(base, previous, { addBackglass, mirror: Boolean(opts.mirror) });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeFileAtomic(target, plan.text);
  return { ini: target, room, backglassDisplays, addBackglass, changes: formatChanges(plan.changes), carried: plan.carried, baseText: base };
}

/**
 * Après une partie en VR jouée dans un double : ses réglages de la VR (que VPX y a enregistrés en
 * quittant) sont gardés pour la suivante, avant que le double parte. Sans double, rien à faire :
 * VPX les a écrits dans <données>\vr\VPinballX.ini.
 */
export function rememberVrSettings(dataDir: string, usedIni: string): void {
  const file = vrIniFile(dataDir);
  if (samePath(usedIni, file)) return;
  const used = readTextIfExists(usedIni);
  if (!used) return;
  const doc = IniDocument.parse(readTextIfExists(file));
  if (!applyVpxSettings(doc, vrCarriedSettings(used)).length) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, doc.toString());
}

/**
 * Borne calée aux manettes (calage.ts) : la place de la table et la barre avant écrites dans l'INI de
 * la VR, d'où chaque partie dans le casque les reprend (vrCarriedSettings).
 */
export function writeVrCalibration(dataDir: string, settings: VpxSetting[]): void {
  writeIniSettings(vrIniFile(dataDir), settings);
}

/** Réglages écrits dans un INI de VPX (la place de la borne du casque dans l'INI d'une partie). */
export function writeIniSettings(file: string, settings: VpxSetting[]): void {
  const doc = IniDocument.parse(readTextIfExists(file));
  applyVpxSettings(doc, settings);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, doc.toString());
}

/**
 * Partie dans le casque sans place enregistrée (vrHasSavedPlace) : une fois la table lancée
 * (« Startup done » dans vpinball.log, après `fromOffset`), et VPX au premier plan, sa touche de
 * recentrage (`key`, VRCenter) est appuyée pour lui : la table vient devant le joueur, à son
 * regard du moment. VPX ignore les touches de ses 5 premières images, d'où le délai. Renvoie de
 * quoi arrêter l'attente (partie finie avant).
 */
export function centerWhenStarted(opts: { logFile: string; fromOffset: number; pid: () => number | undefined; key: string; log(line: string): void }): () => void {
  const vk = windowsVk(opts.key);
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
  if (vk === undefined) {
    opts.log(`Réalité virtuelle : touche de recentrage ${opts.key} inconnue, table pas recentrée.`); // i18n-ignore : journal
    return stop;
  }
  const deadline = Date.now() + 120_000;
  const started = () => {
    try {
      const fd = fs.openSync(opts.logFile, 'r');
      try {
        const size = fs.fstatSync(fd).size;
        if (size <= opts.fromOffset) return false;
        const buffer = Buffer.alloc(size - opts.fromOffset);
        fs.readSync(fd, buffer, 0, buffer.length, opts.fromOffset);
        return buffer.toString('utf8').includes('Startup done');
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return false;
    }
  };
  let tries = 0;
  const press = () => {
    if (stopped) return;
    const pid = opts.pid();
    if (pid !== undefined && foregroundWindow()?.pid === pid) {
      tapKey(vk);
      opts.log(`Réalité virtuelle : table recentrée sur le regard du joueur (${opts.key}), aucune place enregistrée.`); // i18n-ignore : journal
      return;
    }
    if (++tries > 20) return void opts.log('Réalité virtuelle : VPX jamais au premier plan, table pas recentrée.'); // i18n-ignore : journal
    timer = setTimeout(press, 500);
  };
  const wait = () => {
    if (stopped) return;
    if (started()) {
      timer = setTimeout(press, 2_000);
      return;
    }
    if (Date.now() > deadline) return void opts.log('Réalité virtuelle : table jamais lancée, pas recentrée.'); // i18n-ignore : journal
    timer = setTimeout(wait, 500);
  };
  wait();
  return stop;
}

/**
 * L'INI propre à une table prime sur celui de la partie (VPX 10.8.1 : m_table->m_settings) : ce qu'il impose et que VPX
 * refuse en stéréo (SMAA : Indiana Jones, 14 novembre 2026, « FXAA = 6 » dans l'INI à côté de la table) est neutralisé
 * dans une copie, passée à VPX par -TableIni pour la seule partie dans le casque. Le fichier du joueur n'est pas touché.
 */
export interface VrTableIni {
  /** L'INI de la table, à côté d'elle. */
  original: string;
  /** La copie passée à VPX. */
  file: string;
  /** Le texte écrit dans la copie (pour retrouver ce que VPX y a changé pendant la partie). */
  written: string;
  /** Ce qui a été neutralisé (journal). */
  refused: string[];
}

export function prepareVrTableIni(dataDir: string, tableIni: string | undefined): VrTableIni | undefined {
  if (!tableIni || !fs.existsSync(tableIni)) return undefined;
  const text = readTextIfExists(tableIni);
  const refused = tableIniRefusedInStereo(text);
  if (!refused.length) return undefined;
  const doc = IniDocument.parse(text);
  applyVpxSettings(doc, vrStereoFxaa(doc));
  const written = doc.toString();
  const file = path.join(folder(dataDir), 'table-partie.ini');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, written);
  return { original: tableIni, file, written, refused };
}

/**
 * Après la partie : ce que VPX a réécrit dans la copie (réglages changés en jeu) est reporté dans l'INI de la table,
 * sauf ce qui a été neutralisé pour le casque. Rend le nombre de réglages reportés.
 */
export function restoreVrTableIni(t: VrTableIni): number {
  const before = IniDocument.parse(t.written);
  const changed: VpxSetting[] = IniDocument.parse(readTextIfExists(t.file))
    .entries()
    .filter((e) => !(e.section.toLowerCase() === 'player' && e.key.toLowerCase() === 'fxaa') && before.get(e.section, e.key) !== e.value)
    .map((e) => ({ section: e.section, key: e.key, value: e.value }));
  if (changed.length) writeIniSettings(t.original, changed);
  return changed.length;
}
