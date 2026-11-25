// L'inspector de VPX posé pour une partie seul (packages/core/src/soloinspect.ts) : deux choses
// changent le temps de la partie, et reviennent comme avant à la fin :
// - le VPinballX.ini de la borne : [Plugin.Inspector] activé sur un port libre, rien d'autre (ce que
//   VPX y change pendant la partie est gardé) ;
// - pinmame\memmaps du dossier de la table : la carte réduite (cyberpinball.json) et l'entrée de ce
//   jeu dans index.json (celui du joueur est gardé, son entrée remise).
// Ce qui doit être remis est noté dans <données>\inspector-solo.json avant d'y toucher : un arrêt
// brutal de l'application est réparé au démarrage suivant (restoreSoloInspector).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { INSPECTOR_MAP, iniInspectorRestored, iniInspectorSection, iniWithInspector, inspectorMemMapFiles, writeFileAtomic, type InspectorState } from '@cyberpinball/core';

interface Pending {
  ini: string;
  /** Lignes de [Plugin.Inspector] avant la partie ; null : il n'y en avait pas. */
  section: string[] | null;
  dir: string;
  /** index.json avant la partie ; null : il n'y en avait pas. */
  index: string | null;
  /** Le dossier memmaps n'existait pas : il part avec ce qu'on y a posé. */
  madeDir: boolean;
}

const noteFile = (dataDir: string) => path.join(dataDir, 'inspector-solo.json');

export interface SoloInspectorSetup {
  /** Remet le VPinballX.ini et memmaps comme avant. */
  restore(): void;
}

export function prepareSoloInspector(o: { dataDir: string; ini: string; tableFolder: string; games: readonly string[]; states: readonly InspectorState[]; port: number; log?(line: string): void }): SoloInspectorSetup | undefined {
  const log = (line: string) => o.log?.(line);
  // Une partie précédente que rien n'a remise : d'abord.
  restoreSoloInspector(o.dataDir, log);
  const dir = path.join(o.tableFolder, 'pinmame', 'memmaps');
  const indexFile = path.join(dir, 'index.json');
  try {
    const iniText = fs.readFileSync(o.ini, 'utf8');
    const section = iniInspectorSection(iniText);
    let index: string | null = null;
    try {
      index = fs.readFileSync(indexFile, 'utf8');
    } catch {
      index = null;
    }
    const made = inspectorMemMapFiles(o.states, o.games);
    let merged: Record<string, unknown> = {};
    if (index !== null) {
      try {
        const parsed = JSON.parse(index) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) merged = parsed as Record<string, unknown>;
        else return void log('Relevé en direct : index.json de pinmame\\memmaps pas un objet, relevé non posé.'); // i18n-ignore : journal
      } catch {
        return void log('Relevé en direct : index.json de pinmame\\memmaps illisible, relevé non posé.'); // i18n-ignore : journal
      }
    }
    for (const g of o.games) merged[g.trim()] = INSPECTOR_MAP;
    const pending: Pending = { ini: o.ini, section: section ?? null, dir, index, madeDir: !fs.existsSync(dir) };
    // Noté d'abord : un arrêt entre deux écritures se répare.
    writeFileAtomic(noteFile(o.dataDir), JSON.stringify(pending));
    fs.mkdirSync(dir, { recursive: true });
    const map = made.find((f) => f.rel.endsWith(INSPECTOR_MAP))!;
    writeFileAtomic(path.join(dir, INSPECTOR_MAP), map.text);
    writeFileAtomic(indexFile, JSON.stringify(merged, null, 2));
    writeFileAtomic(o.ini, iniWithInspector(iniText, o.port));
    log(`Relevé en direct : inspector de VPX posé pour la partie (127.0.0.1:${o.port}, ${o.states.length} valeurs).`); // i18n-ignore : journal
    return { restore: () => restoreSoloInspector(o.dataDir, log) };
  } catch (error) {
    log(`Relevé en direct : inspector non posé (${(error as Error).message}).`); // i18n-ignore : journal
    restoreSoloInspector(o.dataDir, log);
    return undefined;
  }
}

/** Remet ce que prepareSoloInspector a changé ; sans note, rien à faire. */
export function restoreSoloInspector(dataDir: string, log?: (line: string) => void): void {
  let pending: Pending;
  try {
    pending = JSON.parse(fs.readFileSync(noteFile(dataDir), 'utf8')) as Pending;
  } catch {
    return;
  }
  const failed: string[] = [];
  const attempt = (what: string, fn: () => void) => {
    try {
      fn();
    } catch (error) {
      failed.push(`${what} : ${(error as Error).message}`);
    }
  };
  attempt('VPinballX.ini', () => {
    if (!fs.existsSync(pending.ini)) return;
    const current = fs.readFileSync(pending.ini, 'utf8');
    const back = iniInspectorRestored(current, pending.section ?? undefined);
    if (back !== current) writeFileAtomic(pending.ini, back);
  });
  attempt('memmaps', () => {
    fs.rmSync(path.join(pending.dir, INSPECTOR_MAP), { force: true });
    if (pending.index === null) fs.rmSync(path.join(pending.dir, 'index.json'), { force: true });
    else writeFileAtomic(path.join(pending.dir, 'index.json'), pending.index);
    if (pending.madeDir) {
      try {
        fs.rmdirSync(pending.dir);
        fs.rmdirSync(path.dirname(pending.dir));
      } catch {
        // Autre chose y a été posé depuis : le dossier reste.
      }
    }
  });
  if (failed.length) return void log?.(`Relevé en direct : inspector pas entièrement remis (${failed.join(' ; ')}), nouvel essai au prochain lancement.`); // i18n-ignore : journal
  fs.rmSync(noteFile(dataDir), { force: true });
}
