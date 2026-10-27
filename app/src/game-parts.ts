// « Parties du jeu », depuis la fiche d'une table installée : la table, son fronton, sa ROM,
// son PuP-Pack, ses couleurs de DMD, ses sons, sa musique, son point de vue, ses réglages
// propres et ses médias, chacun présent, reçu (à installer), attendu ou absent. Chaque partie
// s'ajoute ou se remplace (fichier déjà téléchargé, fichier du PC, nouvelle récupération sur
// le web), se réaffecte à une autre table ou se retire. Tout ajout passe par le plan d'ajout,
// ciblé sur cette table (PlanOptions.target) : rien n'est écrit avant « Installer ».
// Cœur : packages/core/src/gameparts.ts (parties présentes), acquisition.ts (liste d'attente).

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyOps,
  CONTENT_LABELS,
  formatDay,
  formatSize,
  GAME_PARTS,
  installedParts,
  isScriptPatchFile,
  linkHost,
  liveLinks,
  NEED_LABELS,
  partFiles,
  partFits,
  partLabel,
  t,
  tableContents,
  tableSourceOf,
  tn,
  trashDirFor,
  versionLabel,
  type FileOp,
  type GamePart,
  type InstalledPart,
  type Layout,
  type NeedKind,
  type TableEntry,
  type VpsDb,
  type VpsGame,
  type VpsTableFile,
  type WaitItem,
} from '@cyberpinball/core';
import type { Catalog } from './catalog';
import type { PickRequest } from './file-picker';
import type { Action, Built, Row, Section, Tone } from './library';
import type { ScriptResult } from './vbs';

export interface GamePartsContext {
  layout(): Layout | undefined;
  tablesDir(): string;
  find(file: string): TableEntry | undefined;
  tables(): TableEntry[];
  /** Script de la table, s'il a déjà été lu (s'il utilise une ROM). */
  script(table: TableEntry): ScriptResult | undefined;
  show(build: () => Built, at?: number, table?: string): void;
  sheet(table: TableEntry): void;
  leave(): void;
  task(message: string, work: () => Promise<void> | void): Promise<void>;
  vps(): Promise<VpsDb | undefined>;
  catalog: Catalog;
  /** Plan d'ajout de ces fichiers, tout destiné à cette table ; `back` : là où revient « Annuler ». */
  install(paths: string[], table: TableEntry, back?: () => void): void;
  pick?(request: Omit<PickRequest, 'done' | 'cancel'>): Promise<string[] | undefined>;
  pupOptions(table: TableEntry): void;
  medias(table: TableEntry): void;
  reload(file?: string): void;
}

type Flash = { text: string; tone: Tone };

/** Extension que VPX attend nommée comme la table : fronton, point de vue, réglages propres. */
const NAMED_LIKE_TABLE: Partial<Record<GamePart, string>> = { b2s: '.directb2s', pov: '.pov', ini: '.ini' };

export function createGameParts(ctx: GamePartsContext) {
  let flash: Flash | undefined;
  /** Jeu VPS de la table ouverte, lu à l'ouverture (fichiers à récupérer sur le web). */
  let game: VpsGame | undefined;

  const gameIdOf = (table: TableEntry) => tableSourceOf(table.info)?.vpsGameId ?? (typeof table.info.Info?.VPSId === 'string' ? table.info.Info.VPSId : undefined);
  const ownFolder = (table: TableEntry) => !samePathText(table.folder, ctx.tablesDir());
  const partsOf = (table: TableEntry) => installedParts(tableContents(table.file, { ownFolder: ownFolder(table), romLibrary: ctx.layout()?.roms }));

  /** Éléments de la liste d'attente pour cette table : récupérés pour elle, ou pour son jeu. */
  function itemsOf(table: TableEntry): WaitItem[] {
    const gameId = gameIdOf(table);
    return ctx.catalog.waitList().items.filter((i) => i.state !== 'installed' && ((i.table && samePathText(i.table, table.file)) || (gameId && i.gameId === gameId)));
  }

  /** Fichiers VPS de cette partie qui ont encore un lien. */
  const webFiles = (part: GamePart): VpsTableFile[] => (game && part !== 'ini' ? partFiles(game, part).filter((f) => liveLinks(f).length) : []);

  const takeFlash = (): Section[] => {
    const own = flash;
    flash = undefined;
    const theirs = ctx.catalog.takeNotice();
    return [own, theirs].filter((n): n is Flash => Boolean(n)).map((n) => ({ rows: [{ text: n.text, tone: n.tone }] }));
  };

  /** Parties du jeu ; `at` : la partie sur laquelle revenir. */
  function open(table: TableEntry, at = 0, notice?: Flash): void {
    if (notice) flash = notice;
    void ctx.task(t('Parties du jeu…'), async () => {
      const db = await ctx.vps();
      const id = gameIdOf(table);
      game = id ? db?.games.find((g) => g.id === id) : undefined;
      // Un fichier qui arrive (fenêtre « Récupérer ») redessine l'écran.
      ctx.catalog.setRefresh(() => ctx.show(() => build(table.file), undefined, table.file));
      ctx.show(() => build(table.file), at, table.file);
    });
  }

  function build(file: string): Built {
    const table = ctx.find(file);
    if (!table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour au menu'), run: ctx.leave }], back: ctx.leave };
    const back = () => {
      ctx.catalog.setRefresh(undefined);
      ctx.sheet(table);
    };
    const parts = partsOf(table);
    const items = itemsOf(table);
    const script = ctx.script(table);
    const usesRom = script && !('error' in script) ? script.usesPinmame : undefined;
    const actions: Action[] = [];
    const rows: Row[] = GAME_PARTS.map((part, index) => {
      actions.push({ label: partLabel(part), run: () => openPart(table, part, index) });
      return { ...partRow(part, parts.get(part), items.find((i) => i.kind === part), usesRom), action: index, pick: true };
    });
    const received = items.filter((i) => i.state === 'received');
    if (received.length) {
      actions.push({ label: t('Installer ce qui est reçu'), detail: t('{parts} · voir le plan', { parts: received.map((i) => NEED_LABELS[i.kind]).join(', ') }), tone: 'ok', run: () => ctx.catalog.installGame(received[0]!.gameId) });
    }
    actions.push({ label: t('Retour à la fiche'), run: back });
    const present = GAME_PARTS.filter((p) => parts.has(p)).length;
    return {
      heading: t('Parties du jeu'),
      subheading: [table.title, tn(present, '{n} présente', '{n} présentes'), received.length ? tn(received.length, '{n} reçue, à installer', '{n} reçues, à installer') : undefined].filter(Boolean).join(' · '),
      lead: t('Tout ce qui fait le jeu, partie par partie. Start sur une partie : l’ajouter ou la remplacer (fichier déjà téléchargé, fichier du PC, nouvelle récupération), la réaffecter à une autre table, la retirer. Rien n’est installé avant le plan.'),
      sections: [...takeFlash(), { rows }],
      actions,
      back,
    };
  }

  /** Ligne d'une partie : présente, reçue, attendue, inutile ou absente. */
  function partRow(part: GamePart, here: InstalledPart | undefined, item: WaitItem | undefined, usesRom: boolean | undefined): Row {
    const text = partLabel(part);
    if (here) {
      const names = here.entries.map((e) => e.rel);
      const shown = names.length > 2 ? t('{names} et {n} autres', { names: names.slice(0, 2).join(', '), n: names.length - 2 }) : names.join(', ');
      const extra = item?.state === 'received' ? t('nouveau fichier reçu, à installer : {file}', { file: path.basename(item.received!.file) }) : undefined;
      return { text, detail: [shown, formatSize(here.size), extra].filter(Boolean).join(' · '), badges: [t('Présent')], tone: 'ok' };
    }
    if (item?.state === 'received') return { text, detail: t('{file} · reçu le {date}', { file: path.basename(item.received!.file), date: formatDay(Date.parse(item.received!.at)) }), badges: [t('Reçu, à installer')], tone: 'info' };
    if (item) return { text, detail: t('{label} · {site}', { label: item.label, site: linkHost(item.page).label }), badges: [t('Attendu')], tone: 'warning' };
    if (part === 'rom' && usesRom === false) return { text, detail: t('cette table n’utilise pas de ROM'), badges: [t('Inutile')], tone: 'quiet' };
    const web = webFiles(part).length;
    return { text, detail: web ? tn(web, 'absent · {n} sur VPS', 'absent · {n} sur VPS') : t('absent'), tone: 'quiet' };
  }

  // ---------- Une partie ----------

  function openPart(table: TableEntry, part: GamePart, from: number, at = 0): void {
    ctx.catalog.setRefresh(() => ctx.show(() => buildPart(table.file, part, from), undefined, table.file));
    ctx.show(() => buildPart(table.file, part, from), at, table.file);
  }

  function buildPart(file: string, part: GamePart, from: number): Built {
    const table = ctx.find(file);
    if (!table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour au menu'), run: ctx.leave }], back: ctx.leave };
    const back = () => open(table, from);
    const here = partsOf(table).get(part);
    const item = itemsOf(table).find((i) => i.kind === part);
    const web = webFiles(part);
    const rows: Row[] = [];
    if (here) {
      rows.push({ text: here.entries.length > 1 ? t('Fichiers') : t('Fichier'), detail: here.entries.map((e) => (e.dir ? `${e.rel}${path.sep}` : e.rel)).join(' · ') });
      rows.push({ text: t('Taille'), detail: formatSize(here.size) });
    } else rows.push({ text: t('État'), detail: t('absent de la table'), tone: 'quiet' });
    if (item?.received) rows.push({ text: t('Reçu, à installer'), detail: t('{file} · le {date}', { file: path.basename(item.received.file), date: formatDay(Date.parse(item.received.at)) }), tone: 'info' });
    else if (item) rows.push({ text: t('Attendu'), detail: t('{label} · {site}', { label: item.label, site: linkHost(item.page).label }), tone: 'warning' });
    if (part !== 'ini' && part !== 'media') rows.push({ text: t('Sur VPS'), detail: web.length ? tn(web.length, '{n} fichier pour ce jeu', '{n} fichiers pour ce jeu') : game ? t('aucun fichier connu') : t('jeu inconnu de la base VPS') });

    const actions: Action[] = [];
    const verb = here ? t('Remplacer') : t('Ajouter');
    if (part !== 'ini') actions.push({ label: t('{verb} depuis Téléchargements', { verb }), detail: t('Fichiers déjà téléchargés, ceux qui conviennent d’abord ; plan à valider'), tone: here ? undefined : 'ok', run: () => openCandidates(table, part as NeedKind, from) });
    if (web.length && game) {
      const g = game;
      actions.push({
        label: t('Récupérer sur le web'),
        detail: web.length > 1 ? tn(web.length, '{n} fichier connu de VPS', '{n} fichiers connus de VPS') : linkHost(liveLinks(web[0]!)[0]!.url).label,
        run: () => (web.length > 1 ? openWeb(table, part as NeedKind, from) : ctx.catalog.fetchFor({ game: g, kind: part as NeedKind, file: web[0]! }, { table: table.file, back: () => openPart(table, part, from) })),
      });
    }
    if (ctx.pick) actions.push({ label: t('Chercher un fichier…'), detail: t('Téléchargements de Cyber Pinball, clé USB, disques'), run: () => void pickFile(table, part, from) });
    if (item?.state === 'received') actions.push({ label: t('Installer ce qui est reçu'), detail: t('Voir le plan'), tone: 'ok', run: () => ctx.catalog.installGame(item.gameId) });
    if (part === 'pup' && here) actions.push({ label: t('Options du PuP-Pack'), detail: t('Disposition des écrans'), run: () => ctx.pupOptions(table) });
    if (part === 'media') actions.push({ label: t('Médias du jeu'), detail: t('Logo, fronton, vidéos, règles : ce que le menu montre'), tone: 'ok', run: () => ctx.medias(table) });
    if (here && part !== 'table' && part !== 'media') actions.push({ label: t('Réaffecter à une autre table'), detail: t('Elle quitte cette table pour une autre'), run: () => openMove(table, part, from) });
    if (here && part !== 'table') actions.push({ label: t('Retirer de la table'), detail: t('Corbeille de Cyber Pinball'), tone: 'error', run: () => confirmRemove(table, part, from) });
    actions.push({ label: t('Retour : parties du jeu'), run: back });
    return {
      heading: partLabel(part),
      subheading: [table.title, here ? t('présent') : item?.received ? t('reçu, à installer') : item ? t('attendu') : t('absent')].join(' · '),
      lead: PART_LEADS[part](),
      sections: [...takeFlash(), { rows }],
      actions,
      back,
      variant: 'facts',
    };
  }

  async function pickFile(table: TableEntry, part: GamePart, from: number): Promise<void> {
    const paths = await ctx.pick!({ title: t('{part} : {title}', { part: partLabel(part), title: table.title }), icon: 'inbox', purpose: t('Parties du jeu : {part}', { part: partLabel(part) }), mode: 'file', start: 'cp' });
    if (paths?.length) {
      ctx.catalog.setRefresh(undefined);
      ctx.install(paths, table, () => openPart(table, part, from));
    } else openPart(table, part, from);
  }

  /** Fichiers déjà téléchargés pour cette partie : ceux qui conviennent d'abord ; Start ouvre le plan d'ajout à cette table. */
  function openCandidates(table: TableEntry, part: NeedKind, from: number): void {
    void ctx.task(t('Fichiers déjà téléchargés…'), async () => {
      const candidates = await ctx.catalog.candidates(part);
      const back = () => openPart(table, part, from);
      ctx.catalog.setRefresh(undefined);
      ctx.show(
        () => {
          const actions: Action[] = [];
          const row = (c: (typeof candidates)[number]): Row => {
            const action = actions.length;
            actions.push({ label: path.basename(c.file), detail: c.origin, run: () => ctx.install([c.file], table, back) });
            const fit = partFits(part, c.seen);
            return {
              text: path.basename(c.file),
              detail: [c.origin, c.seen.content ? CONTENT_LABELS[c.seen.content] : undefined, formatSize(fileSize(c.file)), t('le {date}', { date: formatDay(c.mtimeMs) })].filter(Boolean).join(' · '),
              badges: [fit === 'yes' ? t('Convient') : fit === 'unknown' ? t('Non vérifié') : t('Ne convient pas')],
              tone: fit === 'yes' ? 'ok' : fit === 'unknown' ? 'info' : 'quiet',
              action,
              pick: true,
            };
          };
          const good = candidates.filter((c) => partFits(part, c.seen) !== 'no');
          const bad = candidates.filter((c) => partFits(part, c.seen) === 'no');
          const sections: Section[] = [];
          if (good.length) sections.push({ title: t('Conviennent'), rows: good.map(row) });
          if (bad.length) sections.push({ title: t('Autres fichiers'), rows: bad.map(row) });
          if (!candidates.length) sections.push({ rows: [{ text: t('Aucun fichier déjà téléchargé'), detail: t('Ni gardé de côté, ni dans downloads\\acquisition, ni dans Téléchargements depuis un mois.'), tone: 'quiet' }] });
          actions.push({ label: t('Retour'), run: back });
          return {
            heading: t('{part} : {title}', { part: partLabel(part), title: table.title }),
            subheading: t('Depuis Téléchargements'),
            lead: t('Ceux qui conviennent d’abord. Start ouvre le plan d’ajout à cette table : il montre ce qui sera rangé et remplacé, rien n’est écrit avant « Installer ».'),
            sections,
            actions,
            back,
            drop: (paths) => (paths.length ? ctx.install(paths, table, back) : undefined),
          };
        },
        0,
        table.file,
      );
    });
  }

  /** Fichiers de VPS pour cette partie : Start ouvre sa page dans « Récupérer », pour cette table. */
  function openWeb(table: TableEntry, part: NeedKind, from: number): void {
    const g = game;
    if (!g) return openPart(table, part, from);
    const back = () => openPart(table, part, from);
    const files = webFiles(part).slice(0, 12);
    ctx.show(
      () => ({
        heading: t('{part} : au choix', { part: partLabel(part) }),
        subheading: table.title,
        lead: t('Les plus récents d’abord. Start ouvre sa page dans la fenêtre « Récupérer » : le fichier téléchargé est rangé pour cette table.'),
        sections: [
          {
            rows: files.map((f, i) => ({
              text: part === 'rom' ? (f.version ?? 'ROM') : versionLabel(f),
              detail: [f.updatedAt ? t('le {date}', { date: formatDay(f.updatedAt) }) : undefined, linkHost(liveLinks(f)[0]!.url).label].filter(Boolean).join(' · '),
              action: i,
              pick: true,
            })),
          },
        ],
        actions: [...files.map((f) => ({ label: part === 'rom' ? (f.version ?? 'ROM') : versionLabel(f), run: () => ctx.catalog.fetchFor({ game: g, kind: part, file: f }, { table: table.file, back }) })), { label: t('Retour'), run: back }],
        back,
      }),
      0,
      table.file,
    );
  }

  // ---------- Réaffecter, retirer ----------

  /** Où ira chaque fichier de la partie dans le dossier d'une autre table (nommé comme elle, s'il le faut). */
  function moveOps(here: InstalledPart, to: TableEntry): FileOp[] {
    const ops: FileOp[] = [];
    const named = NAMED_LIKE_TABLE[here.part];
    for (const e of here.entries) {
      const dest = named && !e.dir ? path.join(to.folder, `${path.basename(to.file).replace(/\.vpx$/i, '')}${named}`) : path.join(to.folder, e.rel);
      if (fs.existsSync(dest)) ops.push({ op: 'trash', path: dest });
      ops.push({ op: 'move', from: e.path, to: dest });
    }
    return ops;
  }

  function openMove(table: TableEntry, part: GamePart, from: number): void {
    const back = () => openPart(table, part, from);
    ctx.catalog.setRefresh(undefined);
    const others = ctx
      .tables()
      .filter((x) => !samePathText(x.folder, table.folder) && ownFolder(x))
      .filter((x, i, all) => all.findIndex((o) => samePathText(o.folder, x.folder)) === i)
      .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    ctx.show(
      () => {
        const actions: Action[] = others.map((x) => ({ label: x.title, run: () => move(table, part, x, from) }));
        actions.push({ label: t('Annuler'), run: back });
        return {
          heading: t('Réaffecter : {part}', { part: partLabel(part) }),
          subheading: table.title,
          lead: t('La table qui la reçoit : ses fichiers y sont déplacés, ce qu’elle avait à la place part à la corbeille de Cyber Pinball.'),
          sections: [
            {
              rows: others.length
                ? others.map((x, i) => {
                    const has = partsOf(x).get(part);
                    return { text: x.title, detail: has ? t('a déjà : {files} (remplacé)', { files: has.entries.map((e) => e.rel).join(', ') }) : t('n’en a pas'), tone: has ? ('warning' as const) : undefined, action: i, pick: true };
                  })
                : [{ text: t('Aucune autre table dans son propre dossier'), tone: 'quiet' as const }],
            },
          ],
          actions,
          back,
        };
      },
      0,
      table.file,
    );
  }

  function move(table: TableEntry, part: GamePart, to: TableEntry, from: number): void {
    const here = partsOf(table).get(part);
    if (!here) return open(table, from);
    applyOps(moveOps(here, to), { trashDir: trashDirFor(ctx.layout()!.trash, 'Parties du jeu') }); // i18n-ignore : nom de dossier de la corbeille
    ctx.reload(table.file);
    open(table, from, { text: t('{part} réaffecté à {title}.', { part: partLabel(part), title: to.title }), tone: 'ok' });
  }

  function confirmRemove(table: TableEntry, part: GamePart, from: number): void {
    const here = partsOf(table).get(part);
    if (!here) return open(table, from);
    const back = () => openPart(table, part, from);
    ctx.catalog.setRefresh(undefined);
    ctx.show(
      () => ({
        heading: t('Retirer : {part} ?', { part: partLabel(part) }),
        subheading: table.title,
        lead: t('Les fichiers partent à la corbeille de Cyber Pinball : rien n’est effacé. Une ROM de la bibliothèque y reste ; seule la table ne la voit plus.'),
        sections: [{ rows: here.entries.map((e) => ({ text: e.rel, detail: formatSize(e.size) })) }],
        actions: [
          { label: t('Annuler'), tone: 'ok', run: back },
          { label: t('Retirer de la table'), detail: formatSize(here.size), tone: 'error', run: () => remove(table, part, from) },
        ],
        back,
        variant: 'facts',
      }),
      0,
      table.file,
    );
  }

  function remove(table: TableEntry, part: GamePart, from: number): void {
    const here = partsOf(table).get(part);
    if (!here) return open(table, from);
    const ops: FileOp[] = here.entries.map((e) => ({ op: 'trash', path: e.path }));
    // Sans PuP-Pack, le script que Cyber Pinball avait adapté pour l'allumer n'a plus lieu d'être.
    const patch = table.file.replace(/\.vpx$/i, '.vbs');
    if (part === 'pup' && isScriptPatchFile(patch)) ops.push({ op: 'trash', path: patch });
    applyOps(ops, { trashDir: trashDirFor(ctx.layout()!.trash, 'Parties du jeu') }); // i18n-ignore : nom de dossier de la corbeille
    ctx.reload(table.file);
    open(table, from, { text: t('{part} retiré : dans la corbeille de Cyber Pinball.', { part: partLabel(part) }), tone: 'ok' });
  }

  return { open };
}

/** Ce qu'est chaque partie, en une phrase (tête de son écran). */
const PART_LEADS: Record<GamePart, () => string> = {
  table: () => t('Le fichier .vpx que VPX lance. Une nouvelle version s’ajoute dans le dossier de la table.'),
  b2s: () => t('Le fronton animé (.directb2s), nommé comme la table pour que VPX le charge.'),
  rom: () => t('La ROM que joue PinMAME : rangée dans la bibliothèque, liée dans la table.'),
  pup: () => t('Vidéos sur le fronton et l’afficheur pendant la partie. Un nouveau PuP-Pack remplace l’ancien en entier (l’ancien part à la corbeille).'),
  altcolor: () => t('Couleurs du DMD (Serum, VNI).'),
  altsound: () => t('Sons du jeu remasterisés.'),
  music: () => t('Musique que la table joue pendant la partie.'),
  pov: () => t('Point de vue de la caméra (.pov), nommé comme la table.'),
  topper: () => t('Animation du topper.'),
  ini: () => t('Réglages propres à cette table (.ini nommé comme elle) ; sans eux, ceux de VPX servent.'),
  media: () => t('Logo, fronton, vidéos, règles : ce que montre le menu. Ils se choisissent dans « Médias du jeu ».'),
};

const samePathText = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export type GameParts = ReturnType<typeof createGameParts>;
