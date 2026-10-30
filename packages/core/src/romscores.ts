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
  for (const m of p.validation.mirror ?? []) {
    const offsets = Array.isArray(m.offsets) ? m.offsets.map(num).filter((o): o is number => o !== undefined) : [];
    const count = num(m.repeat?.count) ?? 1;
    const step = num(m.repeat?.step) ?? 0;
    for (let i = 0; i < count; i++) {
      const first = place(p, { start: (num(m.start) ?? NaN) + i * step + (offsets[0] ?? 0), length: m.length, end: m.end }, out);
      if (!first || !written.some((w) => w.at < first.at + first.length && first.at < w.at + w.length)) continue;
      for (const o of offsets.slice(1)) out.copy(out, first.at + (o - (offsets[0] ?? 0)), first.at, first.at + first.length);
    }
  }
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
