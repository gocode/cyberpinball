// Partie entre amis jouée sur un double de la table (packages/core/src/tabledouble.ts), rangé dans
// <racine>\parties\<partie>\ : VPX ouvre le double, le dossier habituel de la table n'est jamais
// ouvert en écriture. Le journal compare l'empreinte de ce dossier avant et après la partie (taille
// et date de chaque fichier) : « intact », ou ce qui a bougé. Les doubles laissés par un plantage
// partent au démarrage suivant ; supprimer un lien physique ne touche jamais l'original.
//
// Sans electron à l'exécution : les tests du cœur peuvent le charger.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyHostSettings,
  folderChanges,
  cachedRomMemory,
  folderPrint,
  groupInitials,
  injectGroupRecords,
  liveStateHook,
  loadedRoms,
  parseLiveState,
  readVpxElements,
  readRomRecords,
  readTableRecords,
  writeRomRecords,
  type LiveGameState,
  type TableRecords,
  makeTableDouble,
  planTableDouble,
  readVpxScript,
  removeTableDouble,
  t,
  usesPinmameCode,
  type GroupRecord,
  type HostSetting,
  type TableEntry,
} from '@cyberpinball/core';

export interface TableDoublesOptions {
  /** Racine de Cyber Pinball : le dossier des parties est <racine>\parties, sur le disque des tables. */
  root(): string | undefined;
  /** Dossier des tables (une table qui y est directement partage son dossier). */
  tablesDir(): string | undefined;
  romsOf?(table: TableEntry): readonly string[];
  /** Cache des cartes mémoire des ROM (ball-count.ts les y met) : records d'une table à ROM. */
  memoryCacheDir?: string;
  log?(line: string): void;
}

export interface TableDouble {
  /** La table à lancer : le double. */
  table: TableEntry;
  /** Le tableau de la table dans le double, maintenant : VPReg.stg, sinon la mémoire de sa ROM (d'après sa carte). */
  records(): TableRecords | undefined;
  /** Le relevé posé dans le script du double (livestate.ts) : vrai si la table en a un. */
  live: boolean;
  /** L'état de jeu que le relevé a écrit, maintenant ; undefined avant le premier ou s'il n'y en a pas. */
  liveState(): LiveGameState | undefined;
  /** Après la partie : compare le dossier habituel à son empreinte d'avant, puis supprime le double. */
  finish(): void;
}

export function createTableDoubles(opts: TableDoublesOptions) {
  const log = (line: string) => opts.log?.(line);
  const partiesDir = () => {
    const root = opts.root();
    return root ? path.join(root, 'parties') : undefined;
  };
  return {
    /**
     * Le double de la table pour la partie `id`, ou la raison de son absence ; `settings` : les
     * réglages de l'hôte (invité), posés dans le double à la place des siens ; `board` : les records
     * du groupe, posés dans le VPReg.stg du double (groupboard.ts).
     */
    start(table: TableEntry, id: string, settings?: readonly HostSetting[], board?: readonly GroupRecord[]): { ok: true; double: TableDouble } | { ok: false; reason: string } {
      const parties = partiesDir();
      const tablesDir = opts.tablesDir();
      if (!parties || !tablesDir) return { ok: false, reason: t('pas de dossier Cyber Pinball') };
      // Le jeu que PinMAME charge (alias.txt de la table) : sa mémoire et sa carte, pas celles du nom demandé.
      const roms = loadedRoms(table.folder, opts.romsOf?.(table) ?? []);
      const planned = planTableDouble(
        {
          file: table.file,
          folder: table.folder,
          ownFolder: path.resolve(table.folder).toLowerCase() !== path.resolve(tablesDir).toLowerCase(),
          roms,
          usesPinmame: roms.length > 0 || usesPinmameCode(readVpxScript(table.file) ?? ''),
          pinmameDir: path.join(opts.root()!, 'pinmame'),
        },
        path.join(parties, id),
      );
      if (!planned.ok) return planned;
      const before = folderPrint(table.folder, { contents: false });
      const made = makeTableDouble(planned.plan, parties);
      if (!made.ok) return made;
      const plan = planned.plan;
      if (settings) {
        try {
          applyHostSettings(plan.dir, settings);
          log(`Partie entre amis (${table.id}) : réglages de l'hôte posés dans le double (${settings.map((s) => `${s.rel}${s.data ? '' : ' retiré'}`).join(', ')}).`); // i18n-ignore : journal
        } catch (error) {
          removeTableDouble(path.join(parties, id), parties);
          dropIfEmpty(parties);
          return { ok: false, reason: t('réglages de l’hôte impossibles à poser : {error}', { error: (error as Error).message }) };
        }
      }
      // Le tableau de la table, dans la partie : les records du groupe, la dernière place à zéro.
      const reg = path.join(plan.dir, 'user', 'VPReg.stg');
      if (board && fs.existsSync(reg)) {
        try {
          const posed = injectGroupRecords(reg, board);
          log(posed ? `Partie entre amis (${table.id}) : records du groupe posés (${Math.min(board.length, posed.places - 1)} sur ${posed.places} places, « ${posed.storage} »).` : `Partie entre amis (${table.id}) : pas de tableau dans VPReg.stg, records du groupe non posés.`); // i18n-ignore : journal
        } catch (error) {
          log(`Partie entre amis (${table.id}) : records du groupe non posés (${(error as Error).message}).`); // i18n-ignore : journal
        }
      }
      // Une table à ROM : son tableau est dans la mémoire de la ROM, écrit d'après sa carte, sommes de contrôle comprises.
      const romBoard = (rom: string) => {
        const nv = path.join(plan.dir, 'pinmame', 'nvram', `${rom.toLowerCase()}.nv`);
        const memory = opts.memoryCacheDir ? cachedRomMemory(opts.memoryCacheDir, rom) : undefined;
        return { nv, memory };
      };
      if (board) {
        for (const rom of roms) {
          const { nv, memory } = romBoard(rom);
          if (!memory || !fs.existsSync(nv)) continue;
          try {
            const before = fs.readFileSync(nv);
            const places = readRomRecords(memory, before)?.length ?? 0;
            const out = places > 1 ? writeRomRecords(memory, before, board.slice(0, places - 1).map((r) => ({ score: r.score, initials: groupInitials(r) }))) : undefined;
            if (out) {
              fs.rmSync(nv, { force: true });
              fs.writeFileSync(nv, out);
            }
            log(out ? `Partie entre amis (${table.id}) : records du groupe posés dans la mémoire de ${rom} (${Math.min(board.length, places - 1)} sur ${places} places).` : `Partie entre amis (${table.id}) : la carte de ${rom} ne permet pas d'écrire son tableau, records du groupe non posés.`); // i18n-ignore : journal
          } catch (error) {
            log(`Partie entre amis (${table.id}) : records du groupe non posés dans ${rom} (${(error as Error).message}).`); // i18n-ignore : journal
          }
        }
      }
      // L'état de jeu en direct : le relevé et le départ automatique ajoutés au script du double (livestate.ts).
      const stateFile = path.join(plan.dir, 'cyberpinball-etat.txt');
      let live = false;
      if (board) {
        try {
          const base = path.basename(plan.file, path.extname(plan.file)).toLowerCase();
          const vbsName = fs.readdirSync(plan.dir).find((f) => f.toLowerCase() === `${base}.vbs`);
          const vbs = path.join(plan.dir, vbsName ?? `${path.basename(plan.file, path.extname(plan.file))}.vbs`);
          const script = vbsName ? fs.readFileSync(vbs, 'latin1') : readVpxScript(plan.file);
          // Une table à ROM : le relevé lit la mémoire de la ROM, d'après sa carte (en cache : ball-count.ts l'y a mise).
          const rom = roms.map((name) => ({ name, memory: romBoard(name).memory })).find((r) => r.memory);
          const hook = script ? liveStateHook(script, readVpxElements(plan.file), stateFile, rom?.memory) : { ok: false as const, reason: 'script illisible ou protégé' }; // i18n-ignore : journal
          if (hook.ok) {
            // Le .vbs du double est une copie (jamais un lien vers l'original) : remplacé, pas réécrit sur place.
            fs.rmSync(vbs, { force: true });
            fs.writeFileSync(vbs, hook.script, 'latin1');
            live = true;
          }
          log(
            hook.ok
              ? `Partie entre amis (${table.id}) : relevé de l'état de jeu et départ automatique posés (${hook.source === 'rom' ? `mémoire de la ROM ${rom?.name}, ` : ''}minuteur de ${hook.element}).` // i18n-ignore : journal
              : `Partie entre amis (${table.id}) : pas de relevé de l'état de jeu (${hook.reason}${roms.length && !rom ? ` ; pas de carte mémoire en cache pour ${roms.join(', ')}` : ''}).`, // i18n-ignore : journal
          );
        } catch (error) {
          log(`Partie entre amis (${table.id}) : relevé de l'état de jeu non posé (${(error as Error).message}).`); // i18n-ignore : journal
        }
      }
      const liveState = (): LiveGameState | undefined => {
        if (!live) return undefined;
        try {
          return parseLiveState(fs.readFileSync(stateFile, 'utf8'));
        } catch {
          return undefined;
        }
      };
      const records = (): TableRecords | undefined => {
        const reg = readTableRecords({ folder: plan.dir, file: plan.file, title: table.title });
        if (reg) return reg;
        for (const rom of roms) {
          const { nv, memory } = romBoard(rom);
          try {
            const scores = memory && fs.existsSync(nv) ? readRomRecords(memory, fs.readFileSync(nv)) : undefined;
            if (scores) return { file: nv, storage: rom, scores };
          } catch {
            // Illisible : la suivante.
          }
        }
        return undefined;
      };
      log(`Partie entre amis (${table.id}) : double prêt, ${plan.links.length} fichiers liés, ${plan.copies.length} copiés, dans ${plan.dir}.`); // i18n-ignore : journal
      let finished = false;
      return {
        ok: true,
        double: {
          table: { ...table, file: plan.file, folder: plan.dir },
          records,
          live,
          liveState,
          finish() {
            if (finished) return;
            finished = true;
            const changes = folderChanges(before, folderPrint(table.folder, { contents: false }));
            if (changes.length) log(`Partie entre amis (${table.id}) : ATTENTION, le dossier de la table a changé pendant la partie : ${changes.slice(0, 20).join(' ; ')}.`); // i18n-ignore : journal
            else log(`Partie entre amis (${table.id}) : dossier de la table intact (${before.size} fichiers comparés).`); // i18n-ignore : journal
            try {
              removeTableDouble(path.join(parties, id), parties);
              dropIfEmpty(parties);
            } catch (error) {
              log(`Partie entre amis (${table.id}) : double non supprimé (${(error as Error).message}) ; il partira au prochain démarrage.`); // i18n-ignore : journal
            }
          },
        },
      };
    },
    /** Au démarrage : les doubles d'une partie interrompue (plantage) s'en vont. */
    sweep(): void {
      const parties = partiesDir();
      if (!parties) return;
      try {
        removeTableDouble(parties, parties);
        dropIfEmpty(parties);
      } catch (error) {
        log(`Parties entre amis : ménage des doubles impossible (${(error as Error).message}).`); // i18n-ignore : journal
      }
    },
  };
}

/** Le dossier des parties, vide, s'en va : la racine reste comme avant. */
function dropIfEmpty(dir: string): void {
  try {
    fs.rmdirSync(dir);
  } catch {
    // Absent, ou une autre partie l'occupe.
  }
}
