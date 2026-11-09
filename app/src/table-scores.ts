// Tableau des scores de chaque table (packages/core/src/scoreboard.ts) : ce que la borne garde de
// chaque partie, et ce que la fiche en montre.
//
// Avant la partie, la mémoire de la ROM est relue (le .nv à côté de la table, sinon dans le dossier
// PinMAME commun) ; après, les scores de la dernière partie y sont lus d'après la carte de la ROM
// (Pinball Memory Maps, en cache dans <données>\cache\cartes-memoire, téléchargée au besoin). Une
// table originale ne dit que les scores entrés à son tableau d'honneur (VPReg.stg) ; une partie
// entre amis, le score relevé en direct. Le tout part dans <données>\scores.json.
//
// Rien ici n'écrit dans les fichiers de la table : la ROM et VPReg.stg ne sont que lus.
//
// Sans electron à l'exécution : les tests du cœur le chargent avec une borne d'essai.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  addPlayed,
  cachedRomMemory,
  gamesInPeriod,
  loadedRoms,
  loadRomMemory,
  loadScoreJournal,
  newRecords,
  readRomLastGame,
  readRomRecords,
  readTableRecords,
  romPlayedScores,
  saveScoreJournal,
  scoreBoard,
  scoreJournalFile,
  vpRegFile,
  type BoardLine,
  type HighScore,
  type MemoryMapOptions,
  type PlayedScore,
  type RomMemory,
  type ScoreJournal,
  type ScorePeriod,
  type TableEntry,
  type TableRecords,
} from '@cyberpinball/core';

export interface TableScoresOptions {
  dataDir: string;
  /** ROM que joue le script de la table (cachedScript). */
  romsOf(table: TableEntry): readonly string[];
  /** Dossiers PinMAME communs (avec nvram\), après celui de la table. */
  pinmameDirs(): readonly string[];
  /** Une carte de ROM vient d'arriver : la fiche peut se redessiner. */
  changed?(): void;
  log?(line: string): void;
  fetch?: MemoryMapOptions['fetch'];
  now?(): Date;
}

/** La mémoire des ROM d'une table au départ de la partie. */
export interface ScoresSnapshot {
  roms: { rom: string; file?: string; bytes?: Buffer }[];
}

export interface GameScores {
  /** Records de la table avant et après la partie (VPReg.stg, highscores.ts). */
  recordsBefore?: TableRecords;
  recordsAfter?: TableRecords;
  /** Partie entre amis : le score de cette borne, relevé en direct. */
  live?: { score?: number };
}

export interface TableBoard {
  lines: BoardLine[];
  /** Parties gardées pendant la période. */
  games: number;
  /** La table tient un tableau d'honneur que la borne sait lire. */
  tableBoard: boolean;
  /** Table à ROM : les scores de chaque partie se lisent (sa carte est connue). */
  everyGame: boolean;
  /** Table à ROM dont la carte n'est pas (encore) là. */
  romWithoutMap: boolean;
}

export interface TableScores {
  /** Au Start : la mémoire des ROM, pour savoir au retour si une partie a été jouée. */
  snapshot(table: TableEntry): ScoresSnapshot;
  /** Au retour : les scores de la partie, gardés ; ce qui a été gardé. */
  finish(table: TableEntry, snapshot: ScoresSnapshot, game: GameScores): Promise<PlayedScore[]>;
  /** Le tableau d'une période. */
  board(table: TableEntry, period: ScorePeriod): TableBoard;
}

export function createTableScores(opts: TableScoresOptions): TableScores {
  const cacheDir = path.join(opts.dataDir, 'cache', 'cartes-memoire');
  const file = scoreJournalFile(opts.dataDir);
  const now = () => opts.now?.() ?? new Date();
  const log = (line: string) => opts.log?.(line);
  let journal: ScoreJournal | undefined;
  let readOnly = false;
  /** Tableau d'honneur de chaque table, relu quand son fichier change. */
  const recordsCache = new Map<string, { stamp: string; scores?: HighScore[] }>();
  /** Cartes déjà demandées au réseau (une fois par ROM et par lancement). */
  const asked = new Set<string>();

  function load(): ScoreJournal {
    if (journal) return journal;
    const read = loadScoreJournal(file, now());
    if (read.setAside) log(`Tableau des scores : ${file} illisible, mis de côté (${read.setAside}).`); // i18n-ignore : journal
    readOnly = Boolean(read.newer);
    journal = read.journal;
    return journal;
  }

  function save(): void {
    if (readOnly || !journal) return;
    try {
      saveScoreJournal(file, journal);
    } catch (error) {
      log(`Tableau des scores : ${file} pas écrit (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  const roms = (table: TableEntry) => loadedRoms(table.folder, opts.romsOf(table));
  const dirs = (table: TableEntry) => [path.join(table.folder, 'pinmame'), ...opts.pinmameDirs()];

  /** Le .nv de cette ROM : à côté de la table, sinon dans le dossier PinMAME commun. */
  function nvFile(table: TableEntry, rom: string): string | undefined {
    for (const dir of dirs(table)) {
      const nv = path.join(dir, 'nvram', `${rom.toLowerCase()}.nv`);
      if (fs.existsSync(nv)) return nv;
    }
    return undefined;
  }

  const readBytes = (nv: string | undefined) => {
    if (!nv) return undefined;
    try {
      return fs.readFileSync(nv);
    } catch {
      return undefined;
    }
  };

  /** Carte en cache, sinon demandée une fois au réseau ; la fiche se redessine à son arrivée. */
  function memoryOf(rom: string): RomMemory | undefined {
    const memory = cachedRomMemory(cacheDir, rom);
    if (memory || asked.has(rom)) return memory;
    asked.add(rom);
    void loadRomMemory(cacheDir, rom, opts.fetch ? { fetch: opts.fetch } : {}).then((m) => m && opts.changed?.());
    return undefined;
  }

  const stampOf = (f: string) => {
    try {
      const st = fs.statSync(f);
      return `${f}:${st.size}:${st.mtimeMs}`;
    } catch {
      return `${f}:absent`;
    }
  };

  /** Tableau d'honneur de la table : VPReg.stg, sinon la mémoire de sa ROM. */
  function tableRecords(table: TableEntry, romList: readonly string[]): { scores?: HighScore[]; romWithoutMap: boolean; everyGame: boolean } {
    let romWithoutMap = false;
    let everyGame = false;
    const sources: { stamp: string; read: () => HighScore[] | undefined }[] = [{ stamp: stampOf(vpRegFile(table)), read: () => readTableRecords(table)?.scores }];
    for (const rom of romList) {
      const memory = memoryOf(rom);
      if (!memory) {
        romWithoutMap = true;
        continue;
      }
      everyGame ||= Boolean((memory.map as { game_state?: { scores?: unknown } }).game_state?.scores);
      const nv = nvFile(table, rom);
      if (nv) sources.push({ stamp: `${stampOf(nv)}:${rom}`, read: () => readRomRecords(memory, fs.readFileSync(nv)) });
    }
    const stamp = sources.map((s) => s.stamp).join('|');
    const known = recordsCache.get(table.id);
    if (known?.stamp === stamp) return { scores: known.scores, romWithoutMap, everyGame };
    let scores: HighScore[] | undefined;
    for (const s of sources) {
      try {
        scores = s.read();
      } catch {
        scores = undefined;
      }
      if (scores?.length) break;
    }
    recordsCache.set(table.id, { stamp, scores });
    return { scores, romWithoutMap, everyGame };
  }

  return {
    snapshot(table) {
      const list = roms(table).map((rom) => {
        const nv = nvFile(table, rom);
        const bytes = readBytes(nv);
        // La carte, demandée dès le départ : elle sera là au retour.
        memoryOf(rom);
        return { rom, ...(nv ? { file: nv } : {}), ...(bytes ? { bytes } : {}) };
      });
      return { roms: list };
    },

    async finish(table, snapshot, game) {
      const at = now().toISOString();
      let played: PlayedScore[] = [];
      if (game.live) {
        if (game.live.score && game.live.score > 0) played = [{ at, score: game.live.score, how: 'live' }];
      } else {
        for (const r of snapshot.roms) {
          const memory = cachedRomMemory(cacheDir, r.rom) ?? (await loadRomMemory(cacheDir, r.rom, opts.fetch ? { fetch: opts.fetch } : {}));
          const after = readBytes(r.file ?? nvFile(table, r.rom));
          if (!memory || !after) continue;
          const last = readRomLastGame(memory, after);
          if (!last) continue;
          const before = r.bytes ? readRomLastGame(memory, r.bytes) : undefined;
          const entered = newRecords(
            r.bytes ? { file: '', storage: r.rom, scores: readRomRecords(memory, r.bytes) ?? [] } : undefined,
            { file: '', storage: r.rom, scores: readRomRecords(memory, after) ?? [] },
          );
          played = romPlayedScores(before, last, entered, at);
          break;
        }
        // Table originale : les scores entrés à son tableau d'honneur, avec leurs initiales.
        if (!played.length && !snapshot.roms.length) played = newRecords(game.recordsBefore, game.recordsAfter).map((s) => ({ at, score: s.score, ...(s.initials ? { initials: s.initials } : {}), how: 'record' as const }));
      }
      if (!played.length) return [];
      if (addPlayed(load(), table.id, played, now())) save();
      log(`Tableau des scores (${table.id}) : ${played.map((p) => `${p.score}${p.initials ? ` ${p.initials}` : ''}`).join(', ')} (${played[0]!.how}).`); // i18n-ignore : journal
      return played;
    },

    board(table, period) {
      const romList = roms(table);
      const records = tableRecords(table, romList);
      const played = load().tables[table.id] ?? [];
      const at = now();
      return {
        lines: scoreBoard(played, records.scores, period, at),
        games: gamesInPeriod(played, period, at),
        tableBoard: Boolean(records.scores?.length),
        everyGame: records.everyGame,
        romWithoutMap: records.romWithoutMap && !records.everyGame,
      };
    },
  };
}
