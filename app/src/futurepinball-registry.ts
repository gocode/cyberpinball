// Future Pinball : les préférences que son installateur écrit dans le registre (HKCU), posées à
// l'extraction (packages/core/src/futurepinball-managed.ts, FUTURE_PINBALL_DEFAULT_PREFERENCES). Chacune
// seulement si elle est absente : un réglage du joueur, ou de Cyber Pinball (écrans de la borne,
// futurepinball-screens.ts), n'est jamais écrasé. HKCU uniquement, sans droits d'administrateur.

import { spawnSync } from 'node:child_process';
import { FUTURE_PINBALL_DEFAULT_PREFERENCES } from '@cyberpinball/core';
import { hkcuValue } from '@cyberpinball/win-displays';

/** Écrit une valeur DWORD sous HKCU (la clé est créée au besoin) ; lève une erreur si Windows refuse. */
function addDword(key: string, name: string, value: number): void {
  const run = spawnSync('reg', ['add', `HKCU\\${key}`, '/v', name, '/t', 'REG_DWORD', '/d', String(value), '/f'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  if (run.status !== 0) throw new Error((run.stderr || run.error?.message || `code ${run.status}`).trim());
}

export interface SeededFuturePinballPreferences {
  /** Valeurs écrites (« GamePlayer\BallDirt = 1 »). */
  written: string[];
  /** Valeurs déjà présentes, laissées telles quelles. */
  present: string[];
  /** Valeurs que Windows a refusé d'écrire, avec la raison. */
  failed: { name: string; reason: string }[];
}

/** Pose les préférences d'une installation neuve qui manquent. Une erreur n'arrête rien : le jeu a ses valeurs par défaut. */
export function seedFuturePinballPreferences(
  read: (key: string, name: string) => unknown = (key, name) => hkcuValue(key, name),
  write: (key: string, name: string, value: number) => void = addDword,
): SeededFuturePinballPreferences {
  const out: SeededFuturePinballPreferences = { written: [], present: [], failed: [] };
  for (const pref of FUTURE_PINBALL_DEFAULT_PREFERENCES) {
    const label = `${pref.key.split('\\').pop()}\\${pref.name} = ${pref.value}`;
    if (read(pref.key, pref.name) !== undefined) {
      out.present.push(label);
      continue;
    }
    try {
      write(pref.key, pref.name, pref.value);
      out.written.push(label);
    } catch (error) {
      out.failed.push({ name: label, reason: (error as Error).message });
    }
  }
  return out;
}
