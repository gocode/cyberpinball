// LED d'une partie : la table joue-t-elle vraiment une ROM PinMAME ? Le plugin DOF de VPX 10.8 n'initialise
// libdof qu'avec une partie PinMAME ; sans elle, le port des LED rendu à DOF ne sert à personne.
//
// Retour d'essai du 26/11/2026 : depuis 0.2.4-essai.42, une table dont le script appelle VPinMAME (code de
// contrôleur recopié, sans ROM) passait « à ROM » : LED éteintes toute la partie. Ce qui compte désormais :
// - avant la partie : un nom de ROM dans le script ET son zip là où PinMAME le cherche (dossier de la table,
//   bibliothèque de ROM, rompath de VPinMAME) ;
// - pendant la partie : vpinball.log. « Startup done » sans « New PinMAME game started » : pas de ROM jouée,
//   la partie passe aux effets sans ROM ; l'inverse rend le port à DOF. Le verdict est gardé par table
//   (led-roms.json), oublié dès que le fichier de la table change.

import * as fs from 'node:fs';
import * as path from 'node:path';

const MEMORY_FILE = 'led-roms.json';

/** Le zip d'une des ROM dans l'un des dossiers (PinMAME ne lit que des zips, par leur nom). */
export function romZipPresent(roms: readonly string[], dirs: readonly (string | undefined)[]): boolean {
  for (const dir of dirs) {
    if (!dir) continue;
    for (const rom of roms) if (rom && fs.existsSync(path.join(dir, `${rom}.zip`))) return true;
  }
  return false;
}

/**
 * Table à ROM pour les LED (DOF de VPX garde le port) : ce qu'une partie a montré, sinon un nom de ROM lu dans
 * le script et son zip dans l'un des dossiers. Le seul appel de VPinMAME dans le script ne suffit pas.
 */
export function ledsHaveRom(roms: readonly string[], dirs: readonly (string | undefined)[], remembered?: boolean): boolean {
  if (remembered !== undefined) return remembered;
  return roms.length > 0 && romZipPresent(roms, dirs);
}

interface Remembered {
  pinmame: boolean;
  size: number;
  mtimeMs: number;
  at: string;
}

const memories = new Map<string, Record<string, Remembered>>();

function memoryOf(dataDir: string): Record<string, Remembered> {
  let m = memories.get(dataDir);
  if (!m) {
    try {
      m = JSON.parse(fs.readFileSync(path.join(dataDir, MEMORY_FILE), 'utf8')) as Record<string, Remembered>;
      if (!m || typeof m !== 'object') m = {};
    } catch {
      m = {};
    }
    memories.set(dataDir, m);
  }
  return m;
}

const keyOf = (table: string) => path.resolve(table).toLowerCase();

/** Ce qu'une partie a montré de la table (PinMAME lancé ou non) ; undefined : jamais vu, ou table changée depuis. */
export function rememberedPinmame(dataDir: string, table: string): boolean | undefined {
  const r = memoryOf(dataDir)[keyOf(table)];
  if (!r) return undefined;
  try {
    const st = fs.statSync(table);
    return st.size === r.size && Math.round(st.mtimeMs) === Math.round(r.mtimeMs) ? r.pinmame : undefined;
  } catch {
    return undefined;
  }
}

export function rememberPinmame(dataDir: string, table: string, pinmame: boolean, now = new Date()): void {
  let st: fs.Stats;
  try {
    st = fs.statSync(table);
  } catch {
    return;
  }
  const m = memoryOf(dataDir);
  m[keyOf(table)] = { pinmame, size: st.size, mtimeMs: Math.round(st.mtimeMs), at: now.toISOString() };
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, MEMORY_FILE), JSON.stringify(m, null, 1));
  } catch {
    // Mémoire perdue : la prochaine partie refera le constat.
  }
}

/** Ce qu'un morceau de vpinball.log dit de la partie. */
export function scanVpxLog(text: string): { pinmame: boolean; startup: boolean } {
  return { pinmame: /New PinMAME game started/i.test(text), startup: /Startup done/i.test(text) };
}

export interface PinmameWatch {
  stop(): void;
}

export interface PinmameWatchOptions {
  logFile: string;
  /** Taille du journal avant le lancement : seules les lignes de cette partie comptent. */
  fromOffset: number;
  /** PinMAME a démarré (true), ou la table a fini de démarrer sans lui (false). Appelé une fois au plus. */
  onVerdict(pinmame: boolean): void;
  /** Attente après « Startup done » (PinMAME peut écrire juste après). */
  graceMs?: number;
  /** Au-delà, sans « Startup done » : aucun verdict (journal absent, autre VPX). */
  maxMs?: number;
  pollMs?: number;
}

/**
 * Suit vpinball.log depuis le lancement : « New PinMAME game started » → true ; « Startup done » puis rien
 * pendant `graceMs` → false. Un journal muet ne donne jamais de verdict : rien n'est changé sur un doute.
 */
export function watchPinmame(o: PinmameWatchOptions): PinmameWatch {
  const graceMs = o.graceMs ?? 6000;
  const maxMs = o.maxMs ?? 180_000;
  const started = Date.now();
  let offset = o.fromOffset;
  let startupAt: number | undefined;
  let tail = '';
  let done = false;
  const finish = (verdict?: boolean) => {
    if (done) return;
    done = true;
    clearInterval(timer);
    if (verdict !== undefined) o.onVerdict(verdict);
  };
  const tick = () => {
    if (done) return;
    const now = Date.now();
    try {
      const size = fs.statSync(o.logFile).size;
      // Journal recommencé par ce lancement : relu du début.
      if (size < offset) {
        offset = 0;
        tail = '';
      }
      if (size > offset) {
        const fd = fs.openSync(o.logFile, 'r');
        const buf = Buffer.alloc(Math.min(size - offset, 4 << 20));
        try {
          fs.readSync(fd, buf, 0, buf.length, offset);
        } finally {
          fs.closeSync(fd);
        }
        offset += buf.length;
        // Une ligne coupée entre deux lectures se retrouve grâce à la fin de la précédente.
        const text = tail + buf.toString('latin1');
        tail = text.slice(-80);
        const seen = scanVpxLog(text);
        if (seen.pinmame) return finish(true);
        if (seen.startup && startupAt === undefined) startupAt = now;
      }
    } catch {
      // Journal pas encore là : au prochain tour.
    }
    if (startupAt !== undefined && now - startupAt >= graceMs) return finish(false);
    if (startupAt === undefined && now - started >= maxMs) finish();
  };
  const timer = setInterval(tick, o.pollMs ?? 1000);
  timer.unref?.();
  return { stop: () => finish() };
}
