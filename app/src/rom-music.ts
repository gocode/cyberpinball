// Musique de la ROM (packages/core/src/romaudio.ts) : la musique de présentation des tables à ROM
// qui n'en ont pas, tirée de leur ROM, en tâche de fond.
//
// - Une ROM à la fois, chacune dans son propre processus (enregistreur-rom.ts, CyberPinball.exe
//   en mode Node, sans fenêtre ni son) sur une copie de ses .zip avec une NVRAM vierge : la
//   NVRAM, les records et les réglages de la table ne sont jamais touchés.
// - D'office : les tables dont le script charge une ROM et qui n'ont pas leur propre musique du
//   jeu, `(Audio)` ; une minute après l'ouverture du menu, puis après chaque partie.
// - Il cède la place dès qu'une partie se prépare : l'enregistrement en cours est arrêté (sans
//   compter comme une tentative) et repris plus tard.
// - Le son gardé (à partir de Start, jusqu'au premier long silence) est encodé en Opus par le
//   convertisseur hors écran (media-convert.ts) et rangé dans <données>\cache\musiques-rom\<rom>.ogg.
//   Le menu le joue en repli de la musique du jeu (resolveMedia, source « rom ») ; « Médias du
//   jeu » > « Musique du jeu » > « Musique de la ROM » le range dans medias\ comme vraie musique.
// - Une ROM muette est notée et jamais réessayée d'office ; une ROM en échec l'est une fois de plus.

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  clipRomAudio,
  formatDate,
  layoutOf,
  loadedRoms,
  noteRomAudio,
  prepareRomScratch,
  readRomAudioState,
  readVpxScript,
  resolveMedia,
  romAudioDir,
  romAudioFile,
  romAudioWanted,
  romKey,
  romStartSwitches,
  ROM_AUDIO_SECONDS,
  t,
  tableRomsDir,
  wavFile,
  writeRomAudioState,
  type RomAudioRecord,
  type RomAudioState,
  type TableEntry,
} from '@cyberpinball/core';
import type { RomRecordJob, RomRecordResult } from './enregistreur-rom';
import type { Converter } from './media-convert';
import { cachedScript } from './vbs';

/** Après l'ouverture du menu, et après chaque partie, avant d'enregistrer d'office. */
export const ROM_MUSIC_IDLE_MS = 60_000;
/** Remplissage automatique revu au plus tous les… */
const RESCAN_MS = 30 * 60_000;
/** Sondage : partie qui commence, file à reprendre. */
const TICK_MS = 1_000;
/** Un enregistrement qui dure plus que cela (temps réel) est abandonné. */
const RECORD_TIMEOUT_MS = (ROM_AUDIO_SECONDS * 3 + 30) * 1000;

export interface RomMusicOptions {
  dataDir: string;
  root: () => string | undefined;
  tables: () => readonly TableEntry[];
  /** Une partie se prépare ou se joue, ou le menu est au bureau : rien ne s'enregistre. */
  busy: () => boolean;
  converter: () => Pick<Converter, 'audioToOggOpus'>;
  /** Un enregistrement commence ou finit : l'état est à renvoyer ; `recorded` : une musique de plus. */
  onChange: (recorded: boolean) => void;
  /** Remplissage automatique (faux pendant les essais hors écran). */
  automatic: boolean;
  log?: (line: string) => void;
  /** Script de l'enregistreur (essais) ; défaut : dist\enregistreur-rom.js à côté de ce module. */
  workerScript?: string;
}

export type RomMusicStatus =
  | { state: 'noRom' }
  | { state: 'ok' | 'queued' | 'recording' | 'none'; rom: string; file?: string; record?: RomAudioRecord }
  | { state: 'silent' | 'failed'; rom: string; record: RomAudioRecord };

export class RomMusic {
  private state: RomAudioState;
  /** ROM à enregistrer, demandées d'abord (forced), puis le remplissage automatique. */
  private queue: { rom: string; table: TableEntry; forced: boolean }[] = [];
  private current?: { rom: string; table: TableEntry; forced: boolean; child?: ChildProcess; stopped?: boolean; exited?: boolean };
  private readonly timer: NodeJS.Timeout;
  private idleSince = Date.now();
  /** Dernier passage du remplissage automatique (0 : à refaire, les tables ont changé). */
  private scannedAt = 0;
  /** ROM de chaque table, relue au plus toutes les minutes : le menu la demande à chaque musique résolue. */
  private readonly roms = new Map<string, { at: number; rom?: string }>();

  constructor(private readonly opts: RomMusicOptions) {
    this.state = readRomAudioState(opts.dataDir);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref();
    // Cyber Pinball qui se ferme n'abandonne pas une ROM qui tourne.
    process.once('exit', () => this.pause());
  }

  /** La ROM que la table charge (alias compris), d'après son script déjà lu ; undefined sans ROM. */
  romOf(table: TableEntry): string | undefined {
    const key = table.file.toLowerCase();
    const known = this.roms.get(key);
    if (known && Date.now() - known.at < 60_000) return known.rom;
    const facts = cachedScript(table.file, this.opts.dataDir);
    const rom = facts?.usesPinmame && facts.roms.length ? loadedRoms(table.folder, facts.roms)[0] : undefined;
    this.roms.set(key, { at: Date.now(), rom });
    return rom;
  }

  /** Musique déjà tirée de la ROM de cette table (repli de la musique du jeu). Rapide : un test de fichier. */
  file(table: TableEntry): string | undefined {
    const rom = this.romOf(table);
    if (!rom) return undefined;
    const file = romAudioFile(this.opts.dataDir, rom);
    return fs.existsSync(file) ? file : undefined;
  }

  status(table: TableEntry): RomMusicStatus {
    const rom = this.romOf(table);
    if (!rom) return { state: 'noRom' };
    const key = romKey(rom);
    const record = this.state[key];
    if (this.current && romKey(this.current.rom) === key) return { state: 'recording', rom, record };
    if (this.queue.some((q) => romKey(q.rom) === key && q.forced)) return { state: 'queued', rom, record };
    const file = this.file(table);
    if (file) return { state: 'ok', rom, file, record };
    if (record?.result === 'silent' || record?.result === 'failed') return { state: record.result, rom, record };
    return { state: 'none', rom, record };
  }

  /** Enregistrer cette table tout de suite (avant la file), même muette ou en échec : demandé depuis « Médias du jeu ». */
  request(table: TableEntry): boolean {
    const rom = this.romOf(table);
    if (!rom) return false;
    if (this.current && romKey(this.current.rom) === romKey(rom)) return true;
    this.queue = this.queue.filter((q) => romKey(q.rom) !== romKey(rom));
    this.queue.unshift({ rom, table, forced: true });
    this.tick();
    return true;
  }

  /** Une partie se prépare : l'enregistrement en cours s'arrête aussitôt, sans compter comme une tentative. */
  pause(): void {
    this.idleSince = Date.now();
    const c = this.current;
    // PinMAME déjà sorti (encodage en cours) : l'enregistrement se termine, rien à reprendre.
    if (!c?.child || c.stopped || c.exited) return;
    c.stopped = true;
    this.queue.unshift({ rom: c.rom, table: c.table, forced: c.forced });
    try {
      c.child.kill();
    } catch {
      // Déjà sorti.
    }
  }

  /** La liste des tables a changé : le remplissage automatique la relira. */
  tablesChanged(): void {
    this.scannedAt = 0;
    this.roms.clear();
  }

  dispose(): void {
    clearInterval(this.timer);
    this.pause();
  }

  private tick(): void {
    if (this.opts.busy()) {
      this.pause();
      return;
    }
    if (this.current) return;
    const forced = this.queue.findIndex((q) => q.forced);
    // Une demande de l'utilisateur part tout de suite ; le remplissage automatique attend que le menu soit au repos.
    if (forced < 0) {
      if (!this.opts.automatic || Date.now() - this.idleSince < ROM_MUSIC_IDLE_MS) return;
      // Revu toutes les 30 minutes : le script d'une table ajoutée n'est pas toujours lu tout de suite.
      if (!this.queue.length && Date.now() - this.scannedAt > RESCAN_MS) this.scan();
    }
    const next = forced >= 0 ? this.queue.splice(forced, 1)[0] : this.queue.shift();
    if (!next) return;
    // Déjà faite entre-temps (demandée depuis « Médias du jeu ») : rien à refaire d'office.
    if (!next.forced && !romAudioWanted(this.state, next.rom, fs.existsSync(romAudioFile(this.opts.dataDir, next.rom)))) return;
    void this.record(next);
  }

  /** Tables à ROM sans musique propre, dont la ROM n'a pas encore été enregistrée ni notée muette. */
  private scan(): void {
    this.scannedAt = Date.now();
    const root = this.opts.root() ?? path.join(this.opts.dataDir, 'sans-racine');
    const seen = new Set<string>();
    for (const table of this.opts.tables()) {
      const rom = this.romOf(table);
      if (!rom || seen.has(romKey(rom))) continue;
      const own = resolveMedia(table, root, 'Audio').source;
      if (own === 'vpx-name' || own === 'folder-name' || own === 'vpinfe') continue;
      if (!romAudioWanted(this.state, rom, fs.existsSync(romAudioFile(this.opts.dataDir, rom)))) continue;
      seen.add(romKey(rom));
      this.queue.push({ rom, table, forced: false });
    }
    if (this.queue.length) this.opts.log?.(`Musique de la ROM : ${this.queue.length} à enregistrer (${this.queue.map((q) => q.rom).join(', ')}).`); // i18n-ignore : journal
  }

  private note(rom: string, outcome: Omit<RomAudioRecord, 'tries' | 'at'>): void {
    this.state = noteRomAudio(this.state, rom, outcome);
    try {
      writeRomAudioState(this.opts.dataDir, this.state);
    } catch {
      // Disque plein ou fichier tenu : l'état reste en mémoire jusqu'au prochain.
    }
  }

  private async record(job: { rom: string; table: TableEntry; forced: boolean }): Promise<void> {
    const current: NonNullable<RomMusic['current']> = { ...job };
    this.current = current;
    this.opts.onChange(false);
    let recorded = false;
    const { rom, table } = job;
    const dir = romAudioDir(this.opts.dataDir);
    const scratch = path.join(dir, 'travail');
    const started = Date.now();
    try {
      const root = this.opts.root();
      const prepared = prepareRomScratch({ scratch: path.join(scratch, 'pinmame'), rom, romDirs: [tableRomsDir(table.folder), ...(root ? [layoutOf(root).roms] : [])], tableFolder: table.folder });
      if (!prepared.copied.some((f) => romKey(f) === romKey(rom))) {
        this.note(rom, { result: 'failed', detail: t('{rom}.zip introuvable dans pinmame\\roms de la table et dans la bibliothèque de ROM', { rom }) });
        return;
      }
      const switches = romStartSwitches(tableScript(table));
      const recordJob: RomRecordJob = {
        dll: pinmameDll(root),
        vpmPath: path.join(scratch, 'pinmame') + path.sep,
        rom,
        switches,
        seconds: ROM_AUDIO_SECONDS,
        pcm: path.join(scratch, 'son.pcm'),
        result: path.join(scratch, 'resultat.json'),
      };
      if (!fs.existsSync(recordJob.dll)) {
        this.note(rom, { result: 'failed', detail: t('PinMAME de VPX introuvable ({file})', { file: recordJob.dll }) });
        return;
      }
      const jobFile = path.join(scratch, 'tache.json');
      fs.writeFileSync(jobFile, JSON.stringify(recordJob, null, 1));
      this.opts.log?.(`Musique de la ROM : enregistrement de ${rom} (${table.title}), interrupteurs ${switches.join(', ') || 'aucun'}.`); // i18n-ignore : journal
      const exit = await this.run(current, jobFile);
      if (current.stopped) {
        this.opts.log?.(`Musique de la ROM : ${rom} interrompue par une partie, reprise plus tard.`); // i18n-ignore : journal
        return;
      }
      if (exit === 'timeout') {
        this.note(rom, { result: 'failed', switches, detail: t('PinMAME n’a pas fini à temps') });
        return;
      }
      let result: RomRecordResult;
      try {
        result = JSON.parse(fs.readFileSync(recordJob.result, 'utf8')) as RomRecordResult;
      } catch {
        this.note(rom, { result: 'failed', switches, detail: t('PinMAME s’est arrêté brutalement') });
        return;
      }
      if (!result.ok) {
        const detail =
          result.error === 'start-failed' ? t('PinMAME n’a pas démarré la ROM (code {n})', { n: String(result.status ?? '?') })
          : result.error === 'stopped' ? t('PinMAME s’est arrêté pendant l’enregistrement')
          : t('PinMAME ne rendait plus de son');
        this.note(rom, { result: 'failed', switches, detail });
        return;
      }
      const pcm = fs.readFileSync(recordJob.pcm);
      const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
      const clip = clipRomAudio(samples, result.channels, result.rate);
      if (!clip.ok) {
        const where = result.display?.split('\n').find((l) => l.trim()) ? t(' ; l’afficheur montrait encore l’attente ou un message') : '';
        this.note(rom, { result: 'silent', switches, detail: t('{n} s de son seulement après Start{where}', { n: clip.loudSeconds.toFixed(1), where }) });
        this.opts.log?.(`Musique de la ROM : ${rom} muette après Start (${clip.loudSeconds} s de son). Afficheur :\n${result.display ?? '(aucun)'}`); // i18n-ignore : journal
        return;
      }
      const wav = path.join(scratch, 'musique.wav');
      fs.writeFileSync(wav, wavFile(Buffer.from(clip.samples.buffer, clip.samples.byteOffset, clip.samples.byteLength), result.rate, result.channels));
      const encoded = await this.opts.converter().audioToOggOpus(wav, romAudioFile(this.opts.dataDir, rom));
      this.note(rom, { result: 'ok', switches, seconds: Math.round(clip.seconds * 10) / 10 });
      recorded = true;
      this.opts.log?.(`Musique de la ROM : ${rom} enregistrée, ${clip.seconds.toFixed(1)} s, ${Math.round(encoded.bytes / 1024)} ko, en ${Math.round((Date.now() - started) / 1000)} s.`); // i18n-ignore : journal
    } catch (error) {
      this.note(rom, { result: 'failed', detail: (error as Error).message.split('\n')[0] });
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
      this.current = undefined;
      this.opts.onChange(recorded);
    }
  }

  private run(current: NonNullable<RomMusic['current']>, jobFile: string): Promise<'exit' | 'timeout'> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [this.opts.workerScript ?? path.join(__dirname, 'enregistreur-rom.js'), jobFile], {
        windowsHide: true,
        cwd: path.dirname(process.execPath),
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: 'ignore',
      });
      current.child = child;
      try {
        // Sous le menu : une ROM émulée ne doit jamais le ralentir (le temps émulé fait l'horloge).
        if (child.pid) os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Priorité refusée : l'enregistrement se fait quand même.
      }
      const timer = setTimeout(() => {
        child.kill();
        resolve('timeout');
      }, RECORD_TIMEOUT_MS);
      const done = () => {
        current.exited = true;
        clearTimeout(timer);
        resolve('exit');
      };
      child.once('exit', done);
      child.once('error', done);
    });
  }
}

/** pinmame64.dll du plugin PinMAME de la version active de VPX. */
export function pinmameDll(root: string | undefined): string {
  return path.join(root ?? '', 'emulators', 'vpx', 'current', 'plugins', 'pinmame', 'pinmame64.dll');
}

/** Script joué par VPX : le .vbs posé à côté de la table le remplace, sinon celui du .vpx. */
function tableScript(table: TableEntry): string | undefined {
  const vbs = table.file.replace(/\.vpx$/i, '.vbs');
  try {
    if (vbs !== table.file && fs.existsSync(vbs)) return fs.readFileSync(vbs, 'latin1');
  } catch {
    // Illisible : celui de la table.
  }
  return readVpxScript(table.file);
}

/** « t2_l8, 30 s, le 12/11/2026 » : la musique d'une ROM dans les propositions. */
export function romMusicLabel(rom: string, record: RomAudioRecord | undefined): string {
  if (!record?.seconds) return rom;
  return t('{rom}, {n} s, enregistrée le {date}', { rom, n: String(Math.round(record.seconds)), date: formatDate(new Date(record.at)) });
}
