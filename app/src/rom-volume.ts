// Volume de la ROM des tables (packages/core/src/romvolume.ts) : lu d'après la carte mémoire en
// cache (<données>\cache\cartes-memoire, ball-count.ts la télécharge), dans la mémoire de la ROM
// (<table>\pinmame\nvram, sinon le dossier PinMAME commun). Avant la partie, le volume voulu est
// posé (choix du joueur, ou volume conseillé à la place d'un volume d'usine bas) ; après, un
// volume changé à la porte devient le choix du joueur. Jamais pendant une partie, jamais dans le
// double d'une partie entre amis (son volume est celui de la borne, hostsettings.ts).
//
// Sans electron à l'exécution : les tests le chargent tel quel.

import * as path from 'node:path';
import {
  cachedRomMemory,
  loadedRoms,
  readRomVolumeChoices,
  romVolumeChangedInGame,
  romVolumeChoice,
  romVolumeLine,
  romVolumeStatus,
  romVolumeTarget,
  saveRomVolumeChoice,
  setRomVolume,
  tablePinmameDir,
  type RomVolumeStatus,
  type TableEntry,
} from '@cyberpinball/core';

export interface RomVolumesOptions {
  dataDir: string;
  romsOf(table: TableEntry): readonly string[];
  /** Dossier PinMAME commun (<racine>\pinmame). */
  sharedPinmame(): string | undefined;
  log?(line: string): void;
}

export interface RomVolumeView {
  status: RomVolumeStatus;
  /** Le volume choisi par le joueur pour cette mémoire ; undefined : automatique. */
  choice?: number;
}

export function createRomVolumes(opts: RomVolumesOptions) {
  const cacheDir = path.join(opts.dataDir, 'cache', 'cartes-memoire');
  const log = opts.log ?? (() => undefined);
  /** L'état lu avant chaque partie (après le volume posé), par table. */
  const before = new Map<string, RomVolumeStatus>();

  function view(table: TableEntry): RomVolumeView {
    const status = romVolumeStatus({
      roms: loadedRoms(table.folder, opts.romsOf(table)),
      pinmameDir: tablePinmameDir(table.folder, opts.sharedPinmame()),
      memory: (rom) => cachedRomMemory(cacheDir, rom),
    });
    const choice = status.kind === 'none' ? undefined : romVolumeChoice(readRomVolumeChoices(opts.dataDir), status.file);
    return { status, ...(choice !== undefined ? { choice } : {}) };
  }

  /** Pose le volume voulu, s'il ne l'est pas ; rend la ligne du journal, ou undefined (rien à faire). */
  function apply(table: TableEntry, v: RomVolumeView, when: string): string | undefined {
    const target = romVolumeTarget(v.status, v.choice);
    if (target === undefined || v.status.kind === 'none') return undefined;
    const from = v.status.kind === 'set' ? String(v.status.value) : 'usine'; // i18n-ignore : journal
    const out = setRomVolume(v.status, target);
    const why = v.choice !== undefined ? 'choix du joueur' : 'volume d’usine bas, conseillé'; // i18n-ignore : journal
    return out.ok
      ? `Volume de la ROM (${table.id}, ${v.status.rom}) : ${from} → ${target} sur ${v.status.spot.max} ${when} (${why}).` // i18n-ignore : journal
      : `Volume de la ROM (${table.id}, ${v.status.rom}) : ${target} non posé (${out.reason}).`; // i18n-ignore : journal
  }

  return {
    view,

    /** La ligne de la fiche ; undefined pour une table sans volume réglable dans sa mémoire. */
    line(table: TableEntry) {
      const v = view(table);
      return romVolumeLine(v.status, v.choice);
    },

    /** Avant une partie (hors double) : le volume voulu posé, l'état gardé pour le retour. */
    beforeGame(table: TableEntry): void {
      try {
        const line = apply(table, view(table), 'avant la partie'); // i18n-ignore : journal
        if (line) log(line);
        before.set(table.file, view(table).status);
      } catch (error) {
        log(`Volume de la ROM (${table.id}) : rien posé avant la partie (${(error as Error).message}).`); // i18n-ignore : journal
      }
    },

    /**
     * Après la partie : un volume changé à la porte devient le choix du joueur ; une première partie
     * qui vient de créer la mémoire au volume d'usine bas le voit monté aussitôt.
     */
    afterGame(table: TableEntry): void {
      const was = before.get(table.file);
      before.delete(table.file);
      try {
        const now = view(table);
        const changed = was ? romVolumeChangedInGame(was, now.status) : undefined;
        if (changed !== undefined && now.status.kind !== 'none') {
          saveRomVolumeChoice(opts.dataDir, now.status.file, changed);
          log(`Volume de la ROM (${table.id}, ${now.status.rom}) : ${changed} sur ${now.status.spot.max}, réglé à la porte pendant la partie, gardé.`); // i18n-ignore : journal
          return;
        }
        const line = apply(table, now, 'après la partie'); // i18n-ignore : journal
        if (line) log(line);
      } catch (error) {
        log(`Volume de la ROM (${table.id}) : non relu après la partie (${(error as Error).message}).`); // i18n-ignore : journal
      }
    },

    /**
     * « Réglages de cette table » > Son : le volume choisi, écrit aussitôt (hors partie), ou
     * `undefined` pour revenir à l'automatique. Rend la raison d'un refus.
     */
    choose(table: TableEntry, value: number | undefined): { ok: true } | { ok: false; reason: string } {
      const v = view(table);
      if (v.status.kind === 'none') return { ok: false, reason: v.status.reason };
      saveRomVolumeChoice(opts.dataDir, v.status.file, value);
      const target = romVolumeTarget(v.status, value);
      if (target === undefined) return { ok: true };
      const out = setRomVolume(v.status, target);
      if (out.ok) log(`Volume de la ROM (${table.id}, ${v.status.rom}) : ${target} sur ${v.status.spot.max} (${value === undefined ? 'automatique' : 'réglage de la table'}).`); // i18n-ignore : journal
      // Pas encore de mémoire : le choix est retenu, posé à la fin de la première partie.
      return out.ok || v.status.kind === 'absent' ? { ok: true } : out;
    },
  };
}

export type RomVolumes = ReturnType<typeof createRomVolumes>;
