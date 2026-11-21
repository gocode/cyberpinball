// Mise en route des ROM sans mémoire (packages/core/src/romfirstboot.ts) : la première partie d'une
// table à ROM ne s'arrête plus sur « FACTORY SETTINGS RESTORED », pièces refusées.
//
// - Une ROM à la fois, dans son propre processus (enregistreur-rom.ts en mode « boot »,
//   CyberPinball.exe en mode Node, sans fenêtre ni son), sur une copie de ses .zip : Échap à 12 s,
//   arrêt propre à 22 s émulées ; la mémoire écrite par PinMAME est posée dans le dossier de
//   PinMAME de la table, seulement si elle y manque toujours.
// - En tâche de fond : les tables à ROM sans mémoire, quelques secondes après l'ouverture du menu,
//   après chaque partie, et dès que la liste des tables change (une table installée).
// - Avant une partie dont la mémoire manque encore : faite tout de suite, pendant le chargement
//   (une fois pour toutes, 23 s mesurées sur taf_l7) ; Exit l'arrête comme il arrête le chargement.
// - Elle cède la place dès qu'une partie se prépare (sauf la sienne) : arrêtée, reprise plus tard.

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  adoptRomMemory,
  layoutOf,
  loadedRoms,
  noteRomBoot,
  prepareRomScratch,
  readRomBootState,
  readVpxScript,
  romBootWanted,
  romKey,
  romMemoryMissing,
  romStartSwitches,
  ROM_BOOT_PLAN,
  tablePinmameDir,
  writeRomBootState,
  type RomBootState,
  type RomMemoryNeed,
  type TableEntry,
} from '@cyberpinball/core';
import type { RomRecordJob, RomRecordResult } from './enregistreur-rom';
import { pinmameDll } from './rom-music';
import { cachedScript } from './vbs';

/** Après l'ouverture du menu, après une partie ou une table ajoutée, avant de mettre en route d'office. */
export const ROM_BOOT_IDLE_MS = 5_000;
const TICK_MS = 1_000;
/** Une mise en route qui dure plus que cela (temps réel) est abandonnée. */
// L'enregistreur s'arrête de lui-même passé 2 × 22 + 15 s réelles, puis laisse 15 s à PinMAME pour écrire.
const BOOT_TIMEOUT_MS = (ROM_BOOT_PLAN.stopAt * 2 + 40) * 1000;

export interface RomFirstBootOptions {
  dataDir: string;
  root: () => string | undefined;
  tables: () => readonly TableEntry[];
  /** Une partie se prépare ou se joue, ou le menu est au bureau : rien d'office. */
  busy: () => boolean;
  /** Remplissage d'office (faux pendant les essais hors écran). */
  automatic: boolean;
  log?: (line: string) => void;
  /** Script de l'enregistreur (essais) ; défaut : dist\enregistreur-rom.js à côté de ce module. */
  workerScript?: string;
}

type Job = { table: TableEntry; need: RomMemoryNeed };
type Running = Job & { child?: ChildProcess; stopped?: boolean; done: Promise<boolean> };

export class RomFirstBoot {
  private state: RomBootState;
  private queue: Job[] = [];
  private current?: Running;
  /** La mise en route en cours a-t-elle été lancée d'office (et non avant une partie) ? */
  private background = false;
  private readonly timer: NodeJS.Timeout;
  private idleSince = Date.now();
  private scanned = false;

  constructor(private readonly opts: RomFirstBootOptions) {
    this.state = readRomBootState(opts.dataDir);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref();
    process.once('exit', () => this.stop());
  }

  /** Une mise en route tourne (la Musique de la ROM attend qu'elle ait fini). */
  active(): boolean {
    return Boolean(this.current && !this.current.stopped);
  }

  /** La mémoire qui manque à cette table, ou undefined (pas de ROM, mémoire là, dossier inconnu). */
  need(table: TableEntry): RomMemoryNeed | undefined {
    const facts = cachedScript(table.file, this.opts.dataDir);
    if (!facts?.usesPinmame || !facts.roms.length) return undefined;
    const root = this.opts.root();
    const pinmameDir = tablePinmameDir(table.folder, root ? path.join(root, 'pinmame') : undefined);
    return romMemoryMissing({ roms: loadedRoms(table.folder, facts.roms), pinmameDir });
  }

  /** La liste des tables a changé (une table installée) : relue au prochain repos. */
  tablesChanged(): void {
    this.scanned = false;
    this.idleSince = Date.now();
  }

  /** Une partie se prépare : la mise en route d'office s'arrête, sans compter comme une tentative. */
  pause(): void {
    this.idleSince = Date.now();
    this.stop();
  }

  dispose(): void {
    clearInterval(this.timer);
    this.stop();
  }

  /**
   * Avant la partie : la mémoire manque encore, la ROM est mise en route tout de suite (jusqu'à
   * une trentaine de secondes, une fois pour toutes). `starting` : elle commence (l'écran de
   * chargement le dit) ; `stopper` : de quoi l'arrêter (Exit). true si la mémoire est là ensuite.
   */
  async beforeGame(table: TableEntry, hooks: { starting?: () => void; stopper?: (stop: () => void) => void } = {}): Promise<boolean> {
    const need = this.need(table);
    if (!need) return true;
    // Déjà en route pour cette ROM : on l'attend ; pour une autre : arrêtée, celle-ci passe d'abord.
    if (this.current && !this.current.stopped && romKey(this.current.need.rom) === romKey(need.rom) && this.current.need.file === need.file) {
      // Elle devient celle de la partie : le chargement ne l'arrête plus.
      this.background = false;
      hooks.starting?.();
      hooks.stopper?.(() => this.stop());
      return this.current.done;
    }
    this.stop();
    hooks.starting?.();
    const run = this.start({ table, need }, false);
    hooks.stopper?.(() => this.stop());
    return run.done;
  }

  private stop(): void {
    const c = this.current;
    if (!c?.child || c.stopped) return;
    c.stopped = true;
    try {
      c.child.kill();
    } catch {
      // Déjà sorti.
    }
  }

  private tick(): void {
    if (!this.opts.automatic) return;
    if (this.opts.busy()) {
      // Une mise en route d'office cède la place ; celle d'avant la partie, non (elle tourne pendant le chargement).
      if (this.current?.child && !this.current.stopped && this.background) this.pause();
      return;
    }
    if (this.current || Date.now() - this.idleSince < ROM_BOOT_IDLE_MS) return;
    if (!this.scanned) this.scan();
    const next = this.queue.shift();
    if (!next) return;
    // Faite entre-temps (une partie jouée, la mémoire posée) : rien à refaire.
    if (fs.existsSync(next.need.file)) return;
    this.start(next, true);
  }

  /** Tables à ROM sans mémoire, une fois par ROM et par dossier de PinMAME. */
  private scan(): void {
    this.scanned = true;
    const seen = new Set<string>();
    this.queue = [];
    for (const table of this.opts.tables()) {
      const need = this.need(table);
      if (!need || seen.has(need.file.toLowerCase()) || !romBootWanted(this.state, need.rom)) continue;
      seen.add(need.file.toLowerCase());
      this.queue.push({ table, need });
    }
    if (this.queue.length) this.opts.log?.(`Mise en route des ROM : ${this.queue.length} sans mémoire (${this.queue.map((q) => q.need.rom).join(', ')}).`); // i18n-ignore : journal
  }

  private start(job: Job, background: boolean): Running {
    let resolve!: (ok: boolean) => void;
    const done = new Promise<boolean>((r) => (resolve = r));
    const running: Running = { ...job, done };
    this.current = running;
    this.background = background;
    void this.boot(running).then(resolve, () => resolve(false));
    return running;
  }

  private note(rom: string, outcome: { result: 'ok' | 'failed'; detail?: string }): void {
    this.state = noteRomBoot(this.state, rom, outcome);
    try {
      writeRomBootState(this.opts.dataDir, this.state);
    } catch {
      // Disque plein ou fichier tenu : l'état reste en mémoire.
    }
  }

  private async boot(running: Running): Promise<boolean> {
    const { table, need } = running;
    // Un dossier par mise en route : celle qu'on arrête pour une autre efface le sien, jamais celui de la suivante.
    const scratch = path.join(this.opts.dataDir, 'cache', 'mise-en-route-rom', `${romKey(need.rom)}-${Date.now()}`);
    const started = Date.now();
    try {
      const root = this.opts.root();
      const prepared = prepareRomScratch({ scratch: path.join(scratch, 'pinmame'), rom: need.rom, romDirs: [path.join(need.pinmameDir, 'roms'), ...(root ? [layoutOf(root).roms] : [])], tableFolder: table.folder });
      if (!prepared.copied.some((f) => romKey(f) === romKey(need.rom))) {
        this.note(need.rom, { result: 'failed', detail: `${need.rom}.zip introuvable` }); // i18n-ignore : journal
        return false;
      }
      const job: RomRecordJob = {
        dll: pinmameDll(root),
        vpmPath: path.join(scratch, 'pinmame') + path.sep,
        rom: need.rom,
        switches: romStartSwitches(tableScript(table)),
        seconds: ROM_BOOT_PLAN.stopAt,
        pcm: path.join(scratch, 'son.pcm'),
        result: path.join(scratch, 'resultat.json'),
        mode: 'boot',
      };
      if (!fs.existsSync(job.dll)) {
        this.note(need.rom, { result: 'failed', detail: `PinMAME de VPX introuvable (${job.dll})` }); // i18n-ignore : journal
        return false;
      }
      const jobFile = path.join(scratch, 'tache.json');
      fs.writeFileSync(jobFile, JSON.stringify(job, null, 1));
      this.opts.log?.(`Mise en route des ROM : ${need.rom} (${table.title}) sans mémoire, mise en route${this.background ? ' d’office' : ' avant la partie'}.`); // i18n-ignore : journal
      const exit = await this.run(running, jobFile);
      if (running.stopped) {
        this.opts.log?.(`Mise en route des ROM : ${need.rom} interrompue, reprise plus tard.`); // i18n-ignore : journal
        return false;
      }
      let result: RomRecordResult | undefined;
      try {
        result = JSON.parse(fs.readFileSync(job.result, 'utf8')) as RomRecordResult;
      } catch {
        // Pas de résultat : PinMAME tombé, ou trop long.
      }
      const adopted = adoptRomMemory(path.join(scratch, 'pinmame', 'nvram', `${need.rom}.nv`), need);
      if (adopted === 'none') {
        const why = exit === 'timeout' ? 'trop longue' : !result ? 'PinMAME s’est arrêté brutalement' : !result.ok ? `PinMAME : ${result.error ?? '?'}` : 'aucune mémoire écrite'; // i18n-ignore : journal
        this.note(need.rom, { result: 'failed', detail: why });
        this.opts.log?.(`Mise en route des ROM : ${need.rom} sans mémoire après la mise en route (${why}).`); // i18n-ignore : journal
        return false;
      }
      this.note(need.rom, { result: 'ok' });
      this.opts.log?.(`Mise en route des ROM : ${need.rom} prête (${adopted === 'adopted' ? `mémoire posée dans ${need.file}` : 'mémoire apparue entre-temps, gardée'}), en ${Math.round((Date.now() - started) / 1000)} s.`); // i18n-ignore : journal
      return true;
    } catch (error) {
      this.note(need.rom, { result: 'failed', detail: (error as Error).message.split('\n')[0] });
      return false;
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
      if (this.current === running) this.current = undefined;
      this.idleSince = Date.now();
    }
  }

  private run(running: Running, jobFile: string): Promise<'exit' | 'timeout'> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [this.opts.workerScript ?? path.join(__dirname, 'enregistreur-rom.js'), jobFile], {
        windowsHide: true,
        cwd: path.dirname(process.execPath),
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: 'ignore',
      });
      running.child = child;
      try {
        // D'office, sous le menu : jamais devant lui. Avant une partie, priorité normale : on l'attend.
        if (child.pid && this.background) os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Priorité refusée : la mise en route se fait quand même.
      }
      const timer = setTimeout(() => {
        child.kill();
        resolve('timeout');
      }, BOOT_TIMEOUT_MS);
      const done = () => {
        clearTimeout(timer);
        resolve('exit');
      };
      child.once('exit', done);
      child.once('error', done);
    });
  }
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
