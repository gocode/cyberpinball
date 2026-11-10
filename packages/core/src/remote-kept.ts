// Téléphones gardés par la borne (remote.ts, app/src/phone-remote.ts). Accepté une fois à la
// borne, un téléphone garde sa clé : il revient ensuite sans QR ni acceptation. La borne range
// les clés dans data\telephones.json, une par téléphone, avec son nom (« Android · Chrome »), le
// jour de son ajout et sa dernière venue ; REMOTE_KEPT_MAX au plus, le plus anciennement vu cède
// sa place. « Oublier » (Menu système > Borne > Télécommande du téléphone) retire la clé.
//
// Le fichier est un secret de la borne, comme les clés du réseau des amis : jamais dans un
// journal ni une capture. Les sauvegardes de la borne l'emportent avec ses réglages (data\) :
// restaurée, la borne reconnaît les mêmes téléphones.

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { deviceLabel, fromBase64Url, REMOTE_KEPT_MAX, REMOTE_KEY_BYTES, toBase64Url, type KeptPhoneKey } from './remote';
import { readKeptJson } from './store';

export const KEPT_PHONES_FILE = 'telephones.json';

/** Un téléphone gardé, tel que le menu le montre. */
export interface KeptPhone {
  id: string;
  device: string;
  /** Accepté à la borne (ms). */
  added: number;
  /** Dernière connexion (ms). */
  seen: number;
}

interface Entry extends KeptPhone {
  key: string;
}

/** Lit la liste du fichier : toute entrée incomplète ou douteuse est écartée, jamais devinée. */
export function parseKeptPhones(raw: unknown): Entry[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { phones?: unknown }).phones) ? (raw as { phones: unknown[] }).phones : [];
  const out: Entry[] = [];
  const ids = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (typeof e.id !== 'string' || !/^[a-z0-9]{8,32}$/.test(e.id) || ids.has(e.id)) continue;
    if (!fromBase64Url(e.key, REMOTE_KEY_BYTES)) continue;
    const added = typeof e.added === 'number' && Number.isFinite(e.added) ? e.added : 0;
    const seen = typeof e.seen === 'number' && Number.isFinite(e.seen) ? e.seen : added;
    ids.add(e.id);
    out.push({ id: e.id, key: e.key as string, device: deviceLabel(e.device), added, seen });
  }
  return out.slice(0, REMOTE_KEPT_MAX);
}

export interface KeptPhonesOptions {
  now?: () => number;
  log?: (line: string) => void;
}

/**
 * Les téléphones gardés de cette borne, dans `dataDir` ; sans dossier (essais du navigateur seul),
 * une liste en mémoire, oubliée à la fermeture.
 */
export function createKeptPhones(dataDir: string | undefined, opts: KeptPhonesOptions = {}) {
  const now = opts.now ?? Date.now;
  const file = dataDir ? path.join(dataDir, KEPT_PHONES_FILE) : undefined;
  let entries: Entry[] = [];
  if (file) {
    const read = readKeptJson(file);
    if (read.setAside) opts.log?.(`Télécommande : liste des téléphones gardés illisible, mise de côté (${path.basename(read.setAside)}).`); // i18n-ignore : journal
    entries = parseKeptPhones(read.value);
  }

  function save(): void {
    if (!file) return;
    try {
      writeFileAtomic(file, JSON.stringify({ version: 1, phones: entries }, null, 2) + '\n');
    } catch (error) {
      opts.log?.(`Télécommande : liste des téléphones gardés non enregistrée (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  return {
    /** Pour l'appairage : les clés à essayer sur un premier message. */
    keys(): KeptPhoneKey[] {
      return entries.map((e) => ({ id: e.id, key: fromBase64Url(e.key, REMOTE_KEY_BYTES)!, device: e.device }));
    },
    /** Pour le menu : du plus récemment vu au plus ancien. */
    list(): KeptPhone[] {
      return entries.map(({ id, device, added, seen }) => ({ id, device, added, seen })).sort((a, b) => b.seen - a.seen);
    },
    size: () => entries.length,
    /** Un téléphone vient d'être accepté : sa clé est gardée ; son identifiant. */
    add(key: Uint8Array, device: string): string {
      const text = toBase64Url(key);
      const same = entries.find((e) => e.key === text);
      if (same) return same.id;
      const at = now();
      const id = crypto.randomBytes(8).toString('hex');
      entries.push({ id, key: text, device: deviceLabel(device), added: at, seen: at });
      if (entries.length > REMOTE_KEPT_MAX) {
        entries.sort((a, b) => b.seen - a.seen);
        entries.length = REMOTE_KEPT_MAX;
      }
      save();
      return id;
    },
    /** Il revient : sa dernière venue (enregistrée au plus une fois par heure, la borne n'écrit pas à chaque connexion). */
    seen(id: string): void {
      const e = entries.find((x) => x.id === id);
      if (!e) return;
      const at = now();
      const stale = at - e.seen > 3_600_000;
      e.seen = at;
      if (stale) save();
    },
    /** « Oublier » : faux s'il n'était pas gardé. */
    forget(id: string): boolean {
      const before = entries.length;
      entries = entries.filter((e) => e.id !== id);
      if (entries.length === before) return false;
      save();
      return true;
    },
  };
}

export type KeptPhones = ReturnType<typeof createKeptPhones>;
