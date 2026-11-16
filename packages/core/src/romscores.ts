// Records d'une table à ROM (PinMAME), lus et écrits dans sa mémoire (<rom>.nv) d'après la carte de
// cette ROM du projet Pinball Memory Maps (ballcount.ts, loadRomMemory ; licence ODbL). Pour la
// partie en direct (groupboard.ts) : avant le lancement, le tableau de la machine reçoit les records
// du groupe, dans le double de la table seulement (tabledouble.ts) ; au retour, le score du joueur
// s'y lit.
//
// La ROM vérifie sa mémoire au démarrage : une somme de contrôle fausse, et elle remet ses records
// d'usine. Une écriture met donc à jour les copies en miroir puis chaque somme de contrôle qui couvre
// un octet changé (_metadata.validation de la carte), puis relit tout : une seule somme fausse, et
// rien n'est écrit. Une carte sans « validation », une mémoire en demi-octets, un encodage inconnu,
// un score trop grand pour sa place : rien n'est écrit.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RomMemory } from './ballcount';
import type { HighScore } from './highscores';

interface Descriptor {
  start?: unknown;
  end?: unknown;
  length?: unknown;
  encoding?: unknown;
  endian?: unknown;
  nibble?: unknown;
  mask?: unknown;
  null?: unknown;
}

interface ScoreEntry {
  label?: unknown;
  score?: Descriptor;
  initials?: Descriptor;
}

interface ChecksumEntry {
  label?: unknown;
  start?: unknown;
  end?: unknown;
  length?: unknown;
  bits?: unknown;
  checksum?: unknown;
  complement?: unknown;
  repeat?: { count?: unknown; step?: unknown };
}

interface MirrorEntry {
  start?: unknown;
  length?: unknown;
  end?: unknown;
  offsets?: unknown;
  repeat?: { count?: unknown; step?: unknown };
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^(0x[0-9a-f]+|\d+)$/i.test(v) ? Number(v) : undefined);

/** Ce que la carte décrit du tableau, et comment la ROM protège sa mémoire. */
function parts(memory: RomMemory) {
  const map = memory.map as RomMemory['map'] & { high_scores?: ScoreEntry[]; _metadata?: { validation?: { checksum?: ChecksumEntry[]; mirror?: MirrorEntry[] } } };
  const nvram = (memory.platform.memory_layout ?? []).filter((r) => r.type === 'nvram');
  const region = nvram.length === 1 && (nvram[0]!.nibble ?? 'both') === 'both' ? { base: num(nvram[0]!.address), size: num(nvram[0]!.size) } : undefined;
  return {
    scores: Array.isArray(map.high_scores) ? map.high_scores : [],
    validation: map._metadata?.validation,
    little: memory.platform.endian === 'little',
    base: region?.base,
    size: region?.size,
  };
}

/** Place d'un descripteur dans le .nv : position et longueur ; undefined hors de la NVRAM. */
function place(p: ReturnType<typeof parts>, d: { start?: unknown; end?: unknown; length?: unknown } | undefined, nv: Buffer): { at: number; length: number } | undefined {
  const start = num(d?.start);
  const end = num(d?.end);
  const length = num(d?.length) ?? (end !== undefined && start !== undefined ? end - start + 1 : 1);
  if (start === undefined || p.base === undefined || p.size === undefined || length < 1) return undefined;
  const at = start - p.base;
  if (at < 0 || at + length > p.size || at + length > nv.length) return undefined;
  return { at, length };
}

function readScore(p: ReturnType<typeof parts>, d: Descriptor | undefined, nv: Buffer): number | undefined {
  const where = place(p, d, nv);
  if (!where || (d!.nibble ?? 'both') !== 'both') return undefined;
  const bytes = [...nv.subarray(where.at, where.at + where.length)];
  const ordered = (d!.endian ?? (p.little ? 'little' : 'big')) === 'little' ? bytes.reverse() : bytes;
  if (d!.encoding === 'int') return ordered.reduce((n, b) => n * 256 + b, 0);
  if (d!.encoding === 'bcd') {
    if (ordered.some((b) => (b & 15) > 9 || b >> 4 > 9)) return undefined;
    return ordered.reduce((n, b) => n * 100 + (b >> 4) * 10 + (b & 15), 0);
  }
  return undefined;
}

function readInitials(p: ReturnType<typeof parts>, d: Descriptor | undefined, nv: Buffer): string | undefined {
  const where = place(p, d, nv);
  if (!where || d!.encoding !== 'ch') return undefined;
  const mask = num(d!.mask) ?? 0xff;
  let text = '';
  for (const b of nv.subarray(where.at, where.at + where.length)) {
    if (b === 0 && d!.null === 'terminate') break;
    text += String.fromCharCode(b & mask);
  }
  const clean = text.replace(/[^\x20-\x7e]/g, '').trim();
  return clean || undefined;
}

/** Le tableau de la machine, de la première place à la dernière ; undefined si la carte ne le décrit pas. */
export function readRomRecords(memory: RomMemory, nv: Buffer): HighScore[] | undefined {
  const p = parts(memory);
  if (!p.scores.length) return undefined;
  const out: HighScore[] = [];
  for (const [i, entry] of p.scores.entries()) {
    const score = readScore(p, entry.score, nv);
    if (score === undefined) return undefined;
    const initials = readInitials(p, entry.initials, nv)?.toUpperCase();
    out.push({ rank: i + 1, score, ...(initials ? { initials } : {}) });
  }
  return out;
}

/**
 * Scores de la dernière partie, joueur par joueur, tels que la ROM les garde dans sa mémoire après
 * la partie (« game_state » de la carte : scores, et player_count quand la carte le décrit) ;
 * undefined si la carte ne les décrit pas ou s'ils sont illisibles. Pour le tableau des scores
 * (scoreboard.ts) : une partie solo n'a pas d'autre source de son score final.
 */
export function readRomLastGame(memory: RomMemory, nv: Buffer): number[] | undefined {
  const p = parts(memory);
  const state = (memory.map as { game_state?: { scores?: unknown; player_count?: Descriptor } }).game_state;
  if (!state || !Array.isArray(state.scores) || !state.scores.length) return undefined;
  const scores: number[] = [];
  for (const d of state.scores as Descriptor[]) {
    const score = readScore(p, d, nv);
    if (score === undefined) return undefined;
    scores.push(score);
  }
  // Nombre de joueurs de la partie, s'il se lit : les places au-delà gardent parfois une partie plus ancienne.
  const count = state.player_count ? readScore(p, { ...state.player_count, length: state.player_count.length ?? 1 }, nv) : undefined;
  return count !== undefined && count >= 1 && count <= scores.length ? scores.slice(0, count) : scores;
}

function encodeScore(p: ReturnType<typeof parts>, d: Descriptor, length: number, score: number): Buffer | undefined {
  const bytes: number[] = [];
  let n = score;
  for (let i = 0; i < length; i++) {
    if (d.encoding === 'int') {
      bytes.push(n % 256);
      n = Math.floor(n / 256);
    } else if (d.encoding === 'bcd') {
      bytes.push(((Math.floor(n / 10) % 10) << 4) | n % 10);
      n = Math.floor(n / 100);
    } else return undefined;
  }
  if (n > 0) return undefined;
  // Construit du poids faible au poids fort : à l'endroit pour le petit-boutiste.
  return Buffer.from((d.endian ?? (p.little ? 'little' : 'big')) === 'little' ? bytes : bytes.reverse());
}

function encodeInitials(d: Descriptor, length: number, initials: string): Buffer {
  const text = initials.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, d.null === 'terminate' ? length - 1 : length);
  const out = Buffer.alloc(length, d.null === 'terminate' ? 0 : 0x20);
  out.write(text, 0, 'latin1');
  return out;
}

/** Les sommes de contrôle de la carte, une par région (les répétitions dépliées). */
function checksums(p: ReturnType<typeof parts>, nv: Buffer): { label: string; at: number; length: number; sumAt: number; bits: number; complement: boolean }[] {
  const out: { label: string; at: number; length: number; sumAt: number; bits: number; complement: boolean }[] = [];
  for (const c of p.validation?.checksum ?? []) {
    const bits = num(c.bits) ?? 8;
    const count = num(c.repeat?.count) ?? 1;
    const step = num(c.repeat?.step) ?? 0;
    for (let i = 0; i < count; i++) {
      const where = place(p, { start: (num(c.start) ?? NaN) + i * step, end: c.end === undefined ? undefined : (num(c.end) ?? NaN) + i * step, length: c.length }, nv);
      if (!where || (bits !== 8 && bits !== 16)) continue;
      const own = num(c.checksum);
      const sumAt = own === undefined ? where.at + where.length - bits / 8 : own + i * step - p.base!;
      // Sans adresse à part, la somme termine la région et ne se compte pas.
      const summed = own === undefined ? where.length - bits / 8 : where.length;
      out.push({ label: String(c.label ?? '').replace('{#}', String(i + 1)), at: where.at, length: summed, sumAt, bits, complement: c.complement === true });
    }
  }
  return out;
}

function checksumOf(nv: Buffer, c: { at: number; length: number; bits: number; complement: boolean }): number {
  let sum = 0;
  for (let i = c.at; i < c.at + c.length; i++) sum += nv[i]!;
  const mask = c.bits === 16 ? 0xffff : 0xff;
  return (c.complement ? ~sum : sum) & mask;
}

function storedChecksum(p: ReturnType<typeof parts>, nv: Buffer, c: { sumAt: number; bits: number }): number {
  return c.bits === 8 ? nv[c.sumAt]! : p.little ? nv.readUInt16LE(c.sumAt) : nv.readUInt16BE(c.sumAt);
}

/** Les copies en miroir d'une zone écrite reçoivent ses nouveaux octets. */
function copyMirrors(p: ReturnType<typeof parts>, out: Buffer, written: readonly { at: number; length: number }[]): void {
  for (const m of p.validation?.mirror ?? []) {
    const offsets = Array.isArray(m.offsets) ? m.offsets.map(num).filter((o): o is number => o !== undefined) : [];
    const count = num(m.repeat?.count) ?? 1;
    const step = num(m.repeat?.step) ?? 0;
    for (let i = 0; i < count; i++) {
      const first = place(p, { start: (num(m.start) ?? NaN) + i * step + (offsets[0] ?? 0), length: m.length, end: m.end }, out);
      if (!first || !written.some((w) => w.at < first.at + first.length && first.at < w.at + w.length)) continue;
      for (const o of offsets.slice(1)) out.copy(out, first.at + (o - (offsets[0] ?? 0)), first.at, first.at + first.length);
    }
  }
}

/** Les sommes de contrôle de la mémoire que la carte décrit, justes ou fausses (pour les essais et la relecture). */
export function romChecksums(memory: RomMemory, nv: Buffer): { label: string; ok: boolean }[] {
  const p = parts(memory);
  return checksums(p, nv).map((c) => ({ label: c.label, ok: checksumOf(nv, c) === storedChecksum(p, nv, c) }));
}

/**
 * Le tableau de la machine rempli des records donnés, du meilleur au moins bon (les places en trop :
 * à zéro, initiales vides) ; copies en miroir et sommes de contrôle mises à jour. Rend la nouvelle
 * mémoire, ou undefined si la carte ne permet pas de l'écrire sûrement.
 */
export function writeRomRecords(memory: RomMemory, nv: Buffer, records: readonly { score: number; initials?: string }[]): Buffer | undefined {
  const p = parts(memory);
  if (!p.scores.length || !p.validation?.checksum?.length) return undefined;
  const out = Buffer.from(nv);
  const written: { at: number; length: number }[] = [];
  const best = [...records].sort((a, b) => b.score - a.score);
  for (const [i, entry] of p.scores.entries()) {
    const r = best[i];
    const where = place(p, entry.score, out);
    if (!where || !entry.score || (entry.score.nibble ?? 'both') !== 'both') return undefined;
    const score = encodeScore(p, entry.score, where.length, r?.score ?? 0);
    if (!score) return undefined;
    score.copy(out, where.at);
    written.push(where);
    if (entry.initials) {
      const at = place(p, entry.initials, out);
      if (!at || entry.initials.encoding !== 'ch') return undefined;
      encodeInitials(entry.initials, at.length, r?.initials ?? '').copy(out, at.at);
      written.push(at);
    }
  }
  // Les copies en miroir d'abord (une somme peut les couvrir), puis les sommes.
  copyMirrors(p, out, written);
  const touched = (c: { at: number; length: number; sumAt: number; bits: number }) => written.some((w) => w.at < c.at + c.length && c.at < w.at + w.length);
  const sums = checksums(p, out);
  for (const c of sums.filter(touched)) {
    const value = checksumOf(out, c);
    if (c.bits === 8) out[c.sumAt] = value;
    else if (p.little) out.writeUInt16LE(value, c.sumAt);
    else out.writeUInt16BE(value, c.sumAt);
  }
  // Relu : chaque région écrite couverte par une somme juste, et le tableau tel que voulu.
  if (sums.filter(touched).some((c) => checksumOf(out, c) !== storedChecksum(p, out, c))) return undefined;
  if (!written.every((w) => sums.some((c) => c.at <= w.at && w.at + w.length <= c.at + c.length))) return undefined;
  const back = readRomRecords(memory, out);
  if (!back || back.some((s, i) => s.score !== (best[i]?.score ?? 0))) return undefined;
  return out;
}

// ---------------------------------------------------------------------------
// Le volume de l'invité dans la mémoire de l'hôte (décision du 16/11/2026)
//
// Dans une partie entre amis, chaque borne garde son niveau sonore : la mémoire de l'hôte voyage
// pour ses réglages de jeu (billes, sauvetage, tilt, extras), mais ses octets de volume sont ceux de
// l'invité. Mesuré au banc libpinmame le 16/11/2026 sur The Addams Family (taf_l7, WPC) : le volume
// est un octet (0x1C9C) protégé par sa propre somme de contrôle ; recopié sans elle, la ROM le
// refuse au démarrage ; sans mémoire, le bloc reste vierge et la ROM joue son volume d'usine.

/** Un niveau sonore dans la carte : « Volume », « Master Volume », « Knocker Volume », « Min. Vol. Override »… */
const SOUND_LEVEL = /\bvol(ume)?\b/i;

/**
 * Plateformes sans volume dans leur mémoire (le son se règle par un potentiomètre de la carte son) :
 * leur mémoire voyage entière. Toutes les autres, sans volume situé par leur carte, gardent celle de
 * l'invité : WPC, Stern SAM, Whitestar, Data East, Capcom, System 11, Gottlieb System 3…
 */
const NO_SOUND_LEVEL_PLATFORM = /^(alving|atari-|bally-|gottlieb-system(1|80)|rowamet|stern-m[12]00|taito|williams-system[4-9]-|zaccaria-)/i;

/** Les réglages de volume que la carte situe (état de la machine et réglages ; jamais les compteurs). */
export function romVolumeEntries(memory: RomMemory): (Descriptor & { label: string; default?: unknown })[] {
  const out: (Descriptor & { label: string; default?: unknown })[] = [];
  const take = (e: unknown) => {
    if (e && typeof e === 'object' && !Array.isArray(e) && typeof (e as { label?: unknown }).label === 'string' && SOUND_LEVEL.test((e as { label: string }).label)) out.push(e as Descriptor & { label: string });
  };
  const map = memory.map as { game_state?: Record<string, unknown>; adjustments?: Record<string, Record<string, unknown>> };
  for (const e of Object.values(map.game_state ?? {})) take(e);
  for (const group of Object.values(map.adjustments ?? {})) for (const e of Object.values(group ?? {})) take(e);
  return out;
}

export type RomVolumeMerge =
  /** La mémoire de l'hôte, les octets de volume de l'invité (ou son volume d'usine), sommes de contrôle refaites. */
  | { kind: 'merged'; data: Buffer; labels: string[] }
  /** La machine n'a pas de volume dans sa mémoire : celle de l'hôte, entière. */
  | { kind: 'host' }
  /** Le volume ne se repose pas sûrement : la mémoire de l'invité telle quelle (ou aucune, s'il n'en a pas). */
  | { kind: 'guest'; reason: string };

/**
 * La mémoire de l'hôte avec le volume de l'invité. `guest` absent : l'invité n'a jamais joué cette
 * table, son volume est celui d'usine (la valeur par défaut de la carte). Le volume se repose quand
 * la carte le situe, octets entiers, chaque zone écrite couverte par une somme de contrôle qu'on sait
 * refaire ; un bloc de volume que la ROM de l'invité tient pour vierge (somme fausse) est recopié tel
 * quel. Sinon, rien de l'hôte : la mémoire de l'invité.
 */
export function mergeRomVolume(memory: RomMemory | undefined, host: Buffer, guest: Buffer | undefined): RomVolumeMerge {
  const refuse = (reason: string): RomVolumeMerge => ({ kind: 'guest', reason });
  if (!memory) return refuse('pas de carte mémoire de cette ROM en cache'); // i18n-ignore : journal
  const entries = romVolumeEntries(memory);
  const platform = String(memory.map._metadata?.platform ?? '');
  if (!entries.length) return NO_SOUND_LEVEL_PLATFORM.test(platform) ? { kind: 'host' } : refuse(`la carte ne situe pas le volume (${platform || 'plateforme inconnue'})`); // i18n-ignore : journal
  const p = parts(memory);
  if (p.base === undefined || !p.validation?.checksum?.length) return refuse('la carte ne décrit pas les sommes de contrôle de la mémoire'); // i18n-ignore : journal
  const out = Buffer.from(host);
  const written: { at: number; length: number }[] = [];
  // Volume d'usine sans valeur dans la carte (WPC) : son bloc laissé vierge, comme PinMAME le crée
  // sans mémoire (0xFF, somme fausse) ; la ROM joue alors son volume par défaut.
  const blank: { at: number; length: number }[] = [];
  for (const e of entries) {
    const where = place(p, e, out);
    if (!where || (e.nibble ?? 'both') !== 'both') return refuse(`« ${e.label} » hors de la mémoire lisible`); // i18n-ignore : journal
    let bytes: Buffer | undefined;
    if (guest) bytes = guest.length >= where.at + where.length ? guest.subarray(where.at, where.at + where.length) : undefined;
    else if (num(e.default) !== undefined) bytes = encodeScore(p, { ...e, encoding: e.encoding === 'enum' ? 'int' : e.encoding }, where.length, num(e.default)!);
    else {
      bytes = Buffer.alloc(where.length, 0xff);
      blank.push(where);
    }
    if (!bytes) return refuse(guest ? 'mémoire de l’invité trop courte' : `volume d’usine de « ${e.label} » impossible à écrire`); // i18n-ignore : journal
    bytes.copy(out, where.at);
    written.push(where);
  }
  copyMirrors(p, out, written);
  const covers = (c: { at: number; length: number }) => written.some((w) => w.at < c.at + c.length && c.at < w.at + w.length);
  const sums = checksums(p, out).filter(covers);
  if (!written.every((w) => sums.some((c) => c.at <= w.at && w.at + w.length <= c.at + c.length))) return refuse('volume hors des sommes de contrôle de la carte'); // i18n-ignore : journal
  // Un bloc qui ne tient que du volume : celui de l'invité peut se recopier tel quel, somme comprise.
  const onlyVolume = (c: { at: number; length: number }) => {
    for (let i = c.at; i < c.at + c.length; i++) if (!written.some((w) => w.at <= i && i < w.at + w.length)) return false;
    return true;
  };
  const valid = (nv: Buffer, c: Parameters<typeof checksumOf>[1] & { sumAt: number }) => nv.length >= Math.max(c.at + c.length, c.sumAt + c.bits / 8) && checksumOf(nv, c) === storedChecksum(p, nv, c);
  const raw = new Set<(typeof sums)[number]>();
  for (const c of sums) {
    if (blank.some((b) => b.at < c.at + c.length && c.at < b.at + b.length)) {
      if (!onlyVolume(c)) return refuse(`volume d’usine de « ${c.label || 'bloc sans nom'} » inconnu de la carte`); // i18n-ignore : journal
      out.fill(0xff, c.sumAt, c.sumAt + c.bits / 8);
      if (valid(out, c)) return refuse('bloc de volume vierge impossible à écrire'); // i18n-ignore : journal
      raw.add(c);
    } else if (guest && !valid(guest, c)) {
      if (!onlyVolume(c)) return refuse(`somme de contrôle de l’invité fausse (${c.label || 'bloc sans nom'})`); // i18n-ignore : journal
      guest.copy(out, c.sumAt, c.sumAt, c.sumAt + c.bits / 8);
      raw.add(c);
    } else if (!valid(host, c) && !onlyVolume(c)) return refuse(`somme de contrôle de l’hôte fausse (${c.label || 'bloc sans nom'})`); // i18n-ignore : journal
  }
  for (const c of sums) {
    if (raw.has(c)) continue;
    const value = checksumOf(out, c);
    if (c.bits === 8) out[c.sumAt] = value;
    else if (p.little) out.writeUInt16LE(value, c.sumAt);
    else out.writeUInt16BE(value, c.sumAt);
  }
  if (sums.some((c) => !raw.has(c) && !valid(out, c))) return refuse('somme de contrôle impossible à refaire'); // i18n-ignore : journal
  return { kind: 'merged', data: out, labels: [...new Set(entries.map((e) => e.label))] };
}

/** Carte d'une ROM déjà en cache (loadRomMemory l'y a mise), sans réseau ; undefined sinon. */
export function cachedRomMemory(cacheDir: string, rom: string): RomMemory | undefined {
  try {
    const index = JSON.parse(fs.readFileSync(path.join(cacheDir, 'index.json'), 'utf8')) as Record<string, unknown>;
    const mapPath = index[rom.trim().toLowerCase()];
    if (typeof mapPath !== 'string' || mapPath.includes('..')) return undefined;
    const map = JSON.parse(fs.readFileSync(path.join(cacheDir, mapPath.replace(/\//g, '_')), 'utf8')) as RomMemory['map'];
    const platform = map._metadata?.platform;
    if (typeof platform !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(platform)) return undefined;
    return { map, platform: JSON.parse(fs.readFileSync(path.join(cacheDir, `platform_${platform}.json`), 'utf8')) as RomMemory['platform'] };
  } catch {
    return undefined;
  }
}
