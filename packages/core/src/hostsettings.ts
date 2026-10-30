// Réglages de celui qui invite, posés dans le double de la table de chaque invité (décision du
// 30/10/2026) : tout le monde part du même état de machine, sans qu'on ait à lire ni comprendre
// chaque réglage. Le nombre de billes, le sauvetage de bille, les avertissements de tilt, les
// billes en extra : la mémoire de la ROM (pinmame\nvram\<rom>.nv) et ses interrupteurs DIP
// (pinmame\cfg\<rom>.cfg), ou les valeurs que la table enregistre (user\VPReg.stg, le menu de
// service des tables de VPW). Un fichier que l'hôte n'a pas est « absent » : retiré du double de
// l'invité, la ROM et la table partent alors de leurs réglages d'usine des deux côtés.
//
// Rien n'est écrit hors du double (tabledouble.ts) : le dossier habituel de l'invité ne bouge pas.
// Les fichiers voyagent par morceaux (un message entre bornes : 256 Kio au plus ; la mémoire d'une
// ROM Stern SAM : 128 Kio), chacun vérifié par son empreinte SHA-256 ; l'invité dit à l'hôte s'il
// les a reçus entiers (game-settings-ok).

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LiveMessage } from './livegame';

/** Un réglage de l'hôte : son chemin dans le dossier de la table, et son contenu (absent : l'hôte n'en a pas). */
export interface HostSetting {
  rel: string;
  data?: Buffer;
}

/** Ce qui peut voyager : la mémoire et les interrupteurs d'une ROM, les valeurs enregistrées par la table. */
const SETTINGS_REL = /^(pinmame\/nvram\/[a-z0-9_-]{1,32}\.nv|pinmame\/cfg\/[a-z0-9_-]{1,32}\.cfg|user\/VPReg\.stg)$/;
export const isSettingsRel = (rel: unknown): rel is string => typeof rel === 'string' && SETTINGS_REL.test(rel);

/** Au plus : fichiers, octets par fichier, octets d'un morceau (base64 : un tiers de plus). */
export const SETTINGS_MAX_FILES = 16;
export const SETTINGS_MAX_BYTES = 1024 * 1024;
const PART_BYTES = 96 * 1024;

const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/**
 * Réglages de ma table, lus sans rien toucher : pour chaque ROM, sa mémoire et ses interrupteurs,
 * dans <table>\pinmame quand la table y a ses ROM, sinon dans le dossier PinMAME commun ; et
 * user\VPReg.stg. Un fichier trop gros n'est pas lu (undefined : pas de réglages à envoyer).
 */
export function readHostSettings(table: { folder: string; roms: readonly string[]; pinmameDir?: string }): HostSetting[] | undefined {
  const own = path.join(table.folder, 'pinmame');
  const pinmame = isDir(path.join(own, 'roms')) ? own : table.pinmameDir;
  const roms = [...new Set(table.roms.map((r) => r.trim().toLowerCase()).filter((r) => /^[a-z0-9_-]{1,32}$/.test(r)))];
  const slots: { rel: string; file?: string }[] = [];
  for (const rom of roms) {
    slots.push({ rel: `pinmame/nvram/${rom}.nv`, ...(pinmame ? { file: path.join(pinmame, 'nvram', `${rom}.nv`) } : {}) });
    slots.push({ rel: `pinmame/cfg/${rom}.cfg`, ...(pinmame ? { file: path.join(pinmame, 'cfg', `${rom}.cfg`) } : {}) });
  }
  slots.push({ rel: 'user/VPReg.stg', file: path.join(table.folder, 'user', 'VPReg.stg') });
  const out: HostSetting[] = [];
  for (const slot of slots.slice(0, SETTINGS_MAX_FILES)) {
    let data: Buffer | undefined;
    try {
      if (slot.file && fs.statSync(slot.file).isFile()) {
        if (fs.statSync(slot.file).size > SETTINGS_MAX_BYTES) return undefined;
        data = fs.readFileSync(slot.file);
      }
    } catch {
      data = undefined;
    }
    out.push({ rel: slot.rel, ...(data ? { data } : {}) });
  }
  return out;
}

/**
 * Pose les réglages de l'hôte dans le double : chaque fichier reçu à sa place, chaque fichier
 * « absent » retiré. Refuse tout chemin hors de ce qui peut voyager ; n'écrit que dans `dir`.
 */
export function applyHostSettings(dir: string, settings: readonly HostSetting[]): void {
  for (const s of settings) {
    if (!isSettingsRel(s.rel)) throw new Error(`réglage refusé : ${s.rel}`); // i18n-ignore : erreur interne, journal
    const file = path.join(dir, ...s.rel.split('/'));
    if (s.data) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // Le fichier du double est une copie (jamais un lien vers l'original) : remplacé, pas réécrit sur place.
      fs.rmSync(file, { force: true });
      fs.writeFileSync(file, s.data);
    } else fs.rmSync(file, { force: true });
  }
}

/** Les messages qui portent les réglages : la liste (empreinte de chaque fichier, ou absent), puis les morceaux. */
export function settingsMessages(game: string, settings: readonly HostSetting[]): LiveMessage[] {
  const out: LiveMessage[] = [{ t: 'game-settings', game, files: settings.map((s) => ({ rel: s.rel, ...(s.data ? { sha: sha(s.data), bytes: s.data.length } : {}) })) }];
  for (const s of settings) {
    if (!s.data) continue;
    const count = Math.max(1, Math.ceil(s.data.length / PART_BYTES));
    for (let index = 0; index < count; index++) {
      out.push({ t: 'game-settings-part', game, rel: s.rel, index, count, data: s.data.subarray(index * PART_BYTES, (index + 1) * PART_BYTES).toString('base64') });
    }
  }
  return out;
}

/**
 * Réception des réglages d'une partie : la liste, puis les morceaux, dans n'importe quel ordre.
 * `take` rend le résultat une fois tout reçu : les réglages vérifiés (ok), ou un échec (un
 * morceau en trop, une empreinte fausse).
 */
export function createSettingsReceiver(game: string) {
  let manifest: { rel: string; sha?: string; bytes?: number }[] | undefined;
  const parts = new Map<string, string[]>();
  let finished = false;
  const result = (): { ok: true; settings: HostSetting[] } | { ok: false } | undefined => {
    if (!manifest) return undefined;
    const settings: HostSetting[] = [];
    for (const f of manifest) {
      if (!f.sha) {
        settings.push({ rel: f.rel });
        continue;
      }
      const got = parts.get(f.rel);
      if (!got || got.some((p) => p === undefined) || got.length === 0) return undefined;
      const data = Buffer.concat(got.map((p) => Buffer.from(p, 'base64')));
      if (data.length !== f.bytes || sha(data) !== f.sha) return { ok: false };
      settings.push({ rel: f.rel, data });
    }
    return { ok: true, settings };
  };
  return {
    take(m: LiveMessage): { ok: true; settings: HostSetting[] } | { ok: false } | undefined {
      if (finished || !('game' in m) || m.game !== game) return undefined;
      if (m.t === 'game-settings') manifest = m.files;
      else if (m.t === 'game-settings-part') {
        const known = manifest?.find((f) => f.rel === m.rel);
        if (manifest && (!known?.sha || m.index >= m.count)) {
          finished = true;
          return { ok: false };
        }
        const got = parts.get(m.rel) ?? Array.from({ length: m.count }, () => undefined as unknown as string);
        if (got.length !== m.count) {
          finished = true;
          return { ok: false };
        }
        got[m.index] = m.data;
        parts.set(m.rel, got);
      } else return undefined;
      const done = result();
      if (done) finished = true;
      return done;
    },
  };
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
