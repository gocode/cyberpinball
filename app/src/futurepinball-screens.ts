// Future Pinball : écrans de ses préférences réglés d'après les rôles de la borne, avant chaque partie
// (logique et raisons : packages/core/src/futurepinball-screens.ts).

import { FUTURE_PINBALL_PLAYER_KEY, futurePinballScreenChanges, type FuturePinballScreenChange, type FuturePinballScreenRoles } from '@cyberpinball/core';
import { hkcuSetValue, hkcuValue } from '@cyberpinball/win-displays';

export interface AppliedFuturePinballScreens {
  /** Préférences écrites. */
  written: FuturePinballScreenChange[];
  /** Préférences que Windows a refusé d'écrire, avec la raison. */
  failed: { change: FuturePinballScreenChange; reason: string }[];
}

/** Écrit dans les préférences du jeu (HKCU) ce que les rôles de la borne demandent ; rien si elles sont déjà justes. */
export function applyFuturePinballScreens(
  roles: FuturePinballScreenRoles,
  read: (name: string) => unknown = (name) => hkcuValue(FUTURE_PINBALL_PLAYER_KEY, name),
  write: (name: string, value: string | number) => void = (name, value) => hkcuSetValue(FUTURE_PINBALL_PLAYER_KEY, name, value),
): AppliedFuturePinballScreens {
  const out: AppliedFuturePinballScreens = { written: [], failed: [] };
  for (const change of futurePinballScreenChanges(roles, read)) {
    try {
      write(change.name, change.to);
      out.written.push(change);
    } catch (error) {
      out.failed.push({ change, reason: (error as Error).message });
    }
  }
  return out;
}

/** Une ligne de journal par préférence changée : « PlayfieldMonitorID \\.\DISPLAY2 → \\.\DISPLAY1 ». */
export function describeFuturePinballScreenChanges(changes: readonly FuturePinballScreenChange[]): string {
  return changes.map((c) => `${c.name} ${c.from ?? '(absent)'} → ${c.to}`).join(', ');
}
