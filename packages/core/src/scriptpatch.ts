// Script de table adapté par Cyber Pinball. VPX 10.8.1 joue un .vbs nommé comme la
// table, posé à côté d'elle, à la place du script écrit dans la table
// (PinTable::LoadScriptOverride, pintable.cpp l. 2199-2209 au commit af26b2d93 ; le
// journal le dit : « Loading script: <fichier> »). Quand le script coupe un PuP-Pack
// pourtant bien installé (« usePUP = False »), Cyber Pinball écrit ce .vbs : le script
// d'origine octet pour octet, sauf la valeur de l'interrupteur, plus une dernière ligne
// de commentaire qui dit d'où il vient (en fin de fichier : les numéros de ligne des
// erreurs de script ne bougent pas). Le médecin le reconnaît, le refait quand la table
// est mise à jour, et un .vbs venu d'ailleurs reste signalé comme avant.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { enablePupSwitch, pupScriptSwitch, type PupSwitch } from './puppack';
import { scriptCode } from './vbscript';

/** Début de la dernière ligne d'un script adapté par Cyber Pinball. */
export const SCRIPT_PATCH_MARK = "' CyberPinball-script ";

export interface ScriptPatch {
  /** Empreinte (SHA-1) du script écrit dans la table, d'où le .vbs est tiré. */
  from: string;
  /** Interrupteurs allumés. */
  switches: PupSwitch[];
}

/** Empreinte d'un script lu en latin1 (un caractère par octet). */
export function scriptHash(script: string): string {
  return createHash('sha1').update(Buffer.from(script, 'latin1')).digest('hex');
}

/**
 * Le .vbs qui lance le PuP-Pack : le script d'origine, interrupteurs allumés, et la
 * ligne de Cyber Pinball. undefined si un interrupteur n'est plus à sa place.
 */
export function buildScriptPatch(original: string, switches: PupSwitch[]): string | undefined {
  let text: string | undefined = original;
  for (const sw of switches) {
    text = text === undefined ? undefined : enablePupSwitch(text, sw);
  }
  if (text === undefined) return undefined;
  const eol = /\r\n/.test(original) ? '\r\n' : '\n';
  const patch: ScriptPatch = { from: scriptHash(original), switches };
  return `${text}${/\r?\n$/.test(text) ? '' : eol}${SCRIPT_PATCH_MARK}${JSON.stringify(patch)}${eol}`;
}

/** Ce que dit la dernière ligne d'un .vbs écrit par Cyber Pinball ; undefined pour un autre .vbs. */
export function readScriptPatch(vbs: string): ScriptPatch | undefined {
  const last = vbs.trimEnd().split(/\r?\n/).at(-1) ?? '';
  if (!last.startsWith(SCRIPT_PATCH_MARK)) return undefined;
  try {
    const patch = JSON.parse(last.slice(SCRIPT_PATCH_MARK.length)) as ScriptPatch;
    return typeof patch.from === 'string' && Array.isArray(patch.switches) ? patch : undefined;
  } catch {
    return undefined;
  }
}

export type ScriptPatchState =
  /** Écrit par Cyber Pinball d'après le script actuel de la table. */
  | { kind: 'ours'; patch: ScriptPatch }
  /**
   * Écrit d'après le script d'une version précédente de la table : VPX joue l'ancien
   * script avec la nouvelle table. `content` : le .vbs refait d'après le nouveau script ;
   * absent si le nouveau script lance déjà le pack (le .vbs n'a plus lieu d'être).
   */
  | { kind: 'stale'; patch: ScriptPatch; content?: string }
  /** Un .vbs venu d'ailleurs (auteur, extraction), ou modifié à la main depuis. */
  | { kind: 'foreign' };

/**
 * État d'un .vbs posé à côté d'une table. `embedded` : le script écrit dans la table
 * (readVpxScript) ; inconnu (table protégée, illisible), le .vbs marqué est cru sur parole.
 */
export function scriptPatchState(vbs: string, embedded: string | undefined): ScriptPatchState {
  const patch = readScriptPatch(vbs);
  if (!patch) return { kind: 'foreign' };
  if (embedded === undefined) return { kind: 'ours', patch };
  if (scriptHash(embedded) !== patch.from) {
    const sw = pupScriptSwitch(scriptCode(embedded));
    const content = sw ? buildScriptPatch(embedded, [sw]) : undefined;
    return content ? { kind: 'stale', patch, content } : { kind: 'stale', patch };
  }
  return buildScriptPatch(embedded, patch.switches) === vbs ? { kind: 'ours', patch } : { kind: 'foreign' };
}

/** Le fichier est un .vbs écrit par Cyber Pinball (dernière ligne marquée). */
export function isScriptPatchFile(file: string): boolean {
  try {
    return readScriptPatch(fs.readFileSync(file, 'latin1')) !== undefined;
  } catch {
    return false;
  }
}
