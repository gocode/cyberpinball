// Réglages de celui qui invite, posés dans le double de la table de chaque invité (décision du
// 30/10/2026) : tout le monde part du même état de machine, sans qu'on ait à lire ni comprendre
// chaque réglage. Le nombre de billes, le sauvetage de bille, les avertissements de tilt, les
// billes en extra : la mémoire de la ROM (pinmame\nvram\<rom>.nv) et ses interrupteurs DIP
// (pinmame\cfg\<rom>.cfg), ou les valeurs que la table enregistre (user\VPReg.stg, le menu de
// service des tables de VPW). Un fichier que l'hôte n'a pas est « absent » : retiré du double de
// l'invité, la ROM et la table partent alors de leurs réglages d'usine des deux côtés.
//
// Le volume ne voyage jamais (décision du 16/11/2026, « le son de la table baisse beaucoup en
// partie entre amis ») : chaque borne garde son niveau sonore, adapté à son lieu. Dans ces mêmes
// fichiers : le volume de la ROM (sa mémoire, d'après la carte de Pinball Memory Maps), les niveaux
// de mixage de PinMAME (fin du .cfg), les volumes que la table enregistre (VPReg.stg). Ceux de
// l'invité restent ; quand ils ne se reposent pas sûrement dans le fichier de l'hôte, c'est le
// fichier de l'invité qui reste, et le journal le dit (le réglage de jeu de l'hôte est alors perdu
// pour ce fichier, jamais le volume de l'invité).
//
// Rien n'est écrit hors du double (tabledouble.ts) : le dossier habituel de l'invité ne bouge pas.
// Les fichiers voyagent par morceaux (un message entre bornes : 256 Kio au plus ; la mémoire d'une
// ROM Stern SAM : 128 Kio), chacun vérifié par son empreinte SHA-256 ; l'invité dit à l'hôte s'il
// les a reçus entiers (game-settings-ok).

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import type { RomMemory } from './ballcount';
import { patchVpRegValues } from './groupboard';
import { readVpReg } from './highscores';
import type { LiveMessage } from './livegame';
import { mergeRomVolume } from './romscores';

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
        // lecture entière : taille vérifiée juste au-dessus (SETTINGS_MAX_BYTES)
        data = fs.readFileSync(slot.file);
      }
    } catch {
      data = undefined;
    }
    out.push({ rel: slot.rel, ...(data ? { data } : {}) });
  }
  return out;
}

/** Ce que l'invité sait de sa table pour garder son volume. */
export interface GuestVolume {
  /** Carte mémoire de la ROM, en cache (cachedRomMemory) : situe le volume dans sa mémoire. */
  memory?(rom: string): RomMemory | undefined;
  /** Clés de VPReg.stg qui tiennent un niveau sonore, en plus de celles qui le disent (scriptVolumeKeys). */
  vpRegKeys?: readonly string[];
}

/**
 * Pose les réglages de l'hôte dans le double, le volume de l'invité gardé (décision du 16/11/2026 :
 * chaque borne garde son niveau sonore, adapté à son lieu ; seuls les réglages de jeu voyagent).
 * Le double tient déjà les fichiers de l'invité (copiés de sa table) : pour chacun, celui de l'hôte
 * avec le volume de l'invité ; quand le volume ne se repose pas sûrement, celui de l'invité tel quel.
 * Rend une ligne par fichier pour le journal : ce qui vient de l'hôte, ce qui est gardé. Refuse tout
 * chemin hors de ce qui peut voyager ; n'écrit que dans `dir`.
 */
export function applyHostSettings(dir: string, settings: readonly HostSetting[], guestVolume: GuestVolume = {}): string[] {
  for (const s of settings) if (!isSettingsRel(s.rel)) throw new Error(`réglage refusé : ${s.rel}`); // i18n-ignore : erreur interne, journal
  const notes: string[] = [];
  for (const s of settings) {
    const file = path.join(dir, ...s.rel.split('/'));
    const guest = readIfFile(file);
    const merged = s.rel === 'user/VPReg.stg' ? mergeVpRegVolume(file, s.data, guest, guestVolume.vpRegKeys ?? []) : s.rel.endsWith('.cfg') ? mergeCfgVolume(s.data, guest) : mergeNvramVolume(s.rel, s.data, guest, guestVolume);
    if (merged.data !== guest) {
      // Le fichier du double est une copie (jamais un lien vers l'original) : remplacé d'un coup
      // (writeFileAtomic : temporaire puis renommage), jamais un instant sans fichier ni tronqué.
      if (merged.data) writeFileAtomic(file, merged.data);
      else fs.rmSync(file, { force: true });
      merged.after?.(file);
    }
    notes.push(`${s.rel} : ${merged.note}`);
  }
  return notes;
}

/** Le contenu posé dans le double (undefined : pas de fichier) ; `after` : retouche sur le fichier posé. */
interface Merged {
  data: Buffer | undefined;
  note: string;
  after?(file: string): void;
}

const guestAsIs = (guest: Buffer | undefined, why: string): Merged => ({ data: guest, note: `${guest ? 'celui de l’invité gardé' : 'absent chez l’invité, laissé absent'} (${why})` }); // i18n-ignore : journal

/** La mémoire de la ROM : celle de l'hôte, les octets de volume de l'invité (romscores.ts, mergeRomVolume). */
function mergeNvramVolume(rel: string, host: Buffer | undefined, guest: Buffer | undefined, opts: GuestVolume): Merged {
  if (!host) return guest ? guestAsIs(guest, 'l’hôte n’en a pas : ses réglages d’usine changeraient le volume') : { data: undefined, note: 'absent des deux côtés' }; // i18n-ignore : journal
  const rom = path.basename(rel, '.nv');
  const merged = mergeRomVolume(opts.memory?.(rom), host, guest);
  if (merged.kind === 'host') return { data: host, note: 'celui de l’hôte (pas de volume dans la mémoire de cette machine)' }; // i18n-ignore : journal
  if (merged.kind === 'guest') return guestAsIs(guest, `${merged.reason} : réglages de jeu de l’hôte non repris`); // i18n-ignore : journal
  return { data: merged.data, note: `celui de l’hôte, ${guest ? 'volume de l’invité gardé' : 'volume d’usine, comme chez l’invité'} (${merged.labels.join(', ')})` }; // i18n-ignore : journal
}

// Le .cfg d'une ROM (PinMAME, config.c, « MAMECFG ») finit par les niveaux de mixage de ses canaux
// de son : 25 niveaux par défaut puis 25 niveaux réglés (mixer.c, MIXER_MAX_CHANNELS). Le reste,
// ses interrupteurs DIP et ses compteurs, vient de l'hôte.
const MIXER_CHANNELS = 25;
const cfgMixer = (cfg: Buffer | undefined) => (cfg && cfg.length >= 8 + 2 * MIXER_CHANNELS && cfg.subarray(0, 7).toString('latin1') === 'MAMECFG' ? { head: cfg.subarray(0, cfg.length - 2 * MIXER_CHANNELS), defaults: cfg.subarray(-2 * MIXER_CHANNELS, -MIXER_CHANNELS), levels: cfg.subarray(-MIXER_CHANNELS) } : undefined);

function mergeCfgVolume(host: Buffer | undefined, guest: Buffer | undefined): Merged {
  const theirs = cfgMixer(host);
  const mine = cfgMixer(guest);
  if (!host) {
    if (!guest) return { data: undefined, note: 'absent des deux côtés' }; // i18n-ignore : journal
    if (mine && mine.levels.equals(mine.defaults)) return { data: undefined, note: 'retiré, comme chez l’hôte (niveaux de son d’usine chez l’invité aussi)' }; // i18n-ignore : journal
    return guestAsIs(guest, mine ? 'l’hôte n’en a pas : ses niveaux de son d’usine changeraient ceux de l’invité' : 'niveaux de son illisibles'); // i18n-ignore : journal
  }
  if (!theirs || (guest && !mine)) return guestAsIs(guest, 'niveaux de son illisibles : interrupteurs de l’hôte non repris'); // i18n-ignore : journal
  if (!mine) return { data: Buffer.concat([theirs.head, theirs.defaults, theirs.defaults]), note: 'interrupteurs de l’hôte, niveaux de son d’usine comme chez l’invité' }; // i18n-ignore : journal
  return { data: Buffer.concat([theirs.head, mine.defaults, mine.levels]), note: 'interrupteurs de l’hôte, niveaux de son de l’invité gardés' }; // i18n-ignore : journal
}

/** Une clé de VPReg.stg qui tient un niveau sonore : son nom le dit (« MusicVolume »), ou le menu de service (scriptVolumeKeys). */
const volumeKey = (key: string, extra: ReadonlySet<string>) => /vol/i.test(key) || extra.has(key.toLowerCase());

/**
 * VPReg.stg : celui de l'hôte, chaque clé de volume à la valeur de l'invité (vide, s'il ne l'a pas :
 * la table prend alors sa valeur par défaut, comme chez lui). Une clé que l'hôte n'a pas, une valeur
 * qui ne tient pas : celui de l'invité tel quel.
 */
function mergeVpRegVolume(file: string, host: Buffer | undefined, guest: Buffer | undefined, keys: readonly string[]): Merged {
  const extra = new Set(keys.map((k) => k.toLowerCase()));
  const mine = guest ? readVpReg(file) : undefined;
  const mineVolume = [...(mine ?? [])].flatMap(([storage, values]) => [...values.keys()].filter((k) => volumeKey(k, extra)).map((k) => ({ storage, key: k, value: values.get(k)! })));
  if (!host) {
    if (!guest) return { data: undefined, note: 'absent des deux côtés' }; // i18n-ignore : journal
    if (!mineVolume.length) return { data: undefined, note: 'retiré, comme chez l’hôte (pas de volume enregistré chez l’invité)' }; // i18n-ignore : journal
    return guestAsIs(guest, 'l’hôte n’en a pas : les valeurs par défaut de la table changeraient le volume'); // i18n-ignore : journal
  }
  if (guest && !mine) return guestAsIs(guest, 'illisible : valeurs de l’hôte non reprises'); // i18n-ignore : journal
  return {
    data: host,
    note: 'celui de l’hôte', // i18n-ignore : journal ; complété après la pose
    after(posed) {
      const theirs = readVpReg(posed);
      if (!theirs) return;
      const patches = new Map<string, Map<string, string>>();
      for (const [storage, values] of theirs) for (const key of values.keys()) if (volumeKey(key, extra)) patches.set(storage, (patches.get(storage) ?? new Map()).set(key, mine?.get(storage)?.get(key) ?? ''));
      const missing = mineVolume.filter((v) => !theirs.get(v.storage)?.has(v.key));
      const skipped: string[] = [];
      if (!missing.length) for (const [storage, values] of patches) skipped.push(...patchVpRegValues(posed, storage, values).skipped);
      const kept = [...patches.values()].flatMap((m) => [...m.keys()]);
      if (missing.length || skipped.length) {
        // Le volume de l'invité ne se pose pas dans le fichier de l'hôte : le sien, tel quel.
        if (guest) writeFileAtomic(posed, guest);
        else fs.rmSync(posed, { force: true });
        this.note = guestAsIs(guest, `${missing.length ? `clé de volume absente chez l’hôte : ${missing.map((v) => v.key).join(', ')}` : `valeur trop longue : ${skipped.join(', ')}`} ; valeurs de l’hôte non reprises`).note; // i18n-ignore : journal
      } else this.note = kept.length ? `celui de l’hôte, volume de l’invité gardé (${kept.join(', ')})` : 'celui de l’hôte (pas de volume enregistré)'; // i18n-ignore : journal
    },
  };
}

function readIfFile(file: string): Buffer | undefined {
  try {
    // lecture entière : fichier de réglages de VPX ou de Cyber Pinball, quelques ko
    return fs.statSync(file).isFile() ? fs.readFileSync(file) : undefined;
  } catch {
    return undefined;
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
