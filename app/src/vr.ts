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
  samePath,
  tableHasVrRoom,
  vrCarriedSettings,
  windowsVk,
  vrReadiness,
  writeFileAtomic,
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
  fs.mkdirSync(folder(dataDir), { recursive: true });
  writeFileAtomic(settingFile(dataDir), JSON.stringify({ mode }, null, 2) + '\n');
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
  /** La table a sa propre pièce VR : pas de fronton ajouté par VPX. */
  room: boolean;
  /** Une ligne par clé écrite, pour le journal. */
  changes: string[];
  /** Réglages de la VR repris de la partie précédente. */
  carried: number;
}

/**
 * Prépare la partie en VR : `baseIni`, l'INI que VPX aurait reçu (celui de la borne, ou celui du
 * double d'une partie entre amis). Le double est déjà une copie à part : il est réécrit sur place
 * (`inPlace`). Sinon, l'INI de la partie est <données>\vr\VPinballX.ini.
 */
export function prepareVrGame(opts: { dataDir: string; baseIni: string; tableFile: string; inPlace: boolean }): VrGame {
  const target = opts.inPlace ? opts.baseIni : vrIniFile(opts.dataDir);
  const previous = readTextIfExists(vrIniFile(opts.dataDir)) || undefined;
  const room = tableHasVrRoom(readVpxScript(opts.tableFile));
  const plan = planVrIni(readTextIfExists(opts.baseIni), previous, { addBackglass: !room });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeFileAtomic(target, plan.text);
  return { ini: target, room, changes: formatChanges(plan.changes), carried: plan.carried };
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
