// Écran « Fichiers téléchargés » (Téléchargements > Fichiers téléchargés) : tout ce que Cyber Pinball a téléchargé,
// gardé sous <racine>\downloads pour le reprendre sans le télécharger de nouveau — d'où
// il vient, quand, sa taille, à quoi il sert, ce qu'il contient. Un fichier s'ouvre : l'ajouter
// à n'importe quel jeu (une table installée, ou un jeu de la liste d'attente), dans la partie
// que dit son contenu ; l'installer comme nouvelle table ; le mettre à la corbeille ; « Tout vider » met toute la zone à la corbeille de
// Cyber Pinball, après confirmation. En option, les fichiers récents du dossier
// Téléchargements de Windows, montrés ici sans ouvrir l'explorateur.
// Cœur : packages/core/src/downloads.ts.

import * as path from 'node:path';
import {
  CONTENT_LABELS,
  DOWNLOAD_KIND_LABELS,
  DOWNLOAD_ORIGIN_LABELS,
  DOWNLOAD_SORT_LABELS,
  DOWNLOAD_SORTS,
  downloadLine,
  downloadsSummary,
  downloadTotals,
  emptiableDownloads,
  formatDateTime,
  formatList,
  formatSize,
  NEED_LABELS,
  PART_KINDS,
  sortDownloads,
  t,
  tn,
  trashDownloads,
  type DownloadEntry,
  type AddScreenId,
  type ContentKind,
  type DownloadSort,
  type Layout,
  type NeedKind,
  type TableEntry,
  knownVpsId,
} from '@cyberpinball/core';
import type { Action, Built, Row, Section, Tone } from './library';
import { useNote } from './file-picker';

export interface DownloadsScreenContext {
  layout(): Layout | undefined;
  show(build: () => Built, at?: number): void;
  /** Inventaire ; `windows` : avec les fichiers récents de Téléchargements de Windows. */
  inventory(windows: boolean): DownloadEntry[];
  /** Les fichiers sont partis : la liste d'attente et les relevés des sites oublient. Renvoie les éléments redevenus attendus. */
  forget(files: string[]): number;
  /** Reprendre un fichier comme nouvelle table (plan d'ajout). */
  install(paths: string[]): void;
  /** Ce que contient un fichier : sa partie principale et toutes celles qu'il apporte (archive listée). */
  inspect(file: string): Promise<{ content: ContentKind; summary?: string; parts?: NeedKind[] }>;
  /** Le jeu auquel il revient sans doute : sa table installée, ou un jeu de la liste d'attente. */
  suggest(file: string): { table?: TableEntry; game?: { gameId: string; label: string } };
  /** Tables installées, une par dossier. */
  tables(): TableEntry[];
  /** Jeux de la liste d'attente. */
  games(): { gameId: string; label: string }[];
  /** Plan d'ajout de ce fichier à une table installée, tout destiné à elle. */
  addToTable(paths: string[], table: TableEntry): void;
  /** Rattache le fichier à une partie d'un jeu de la liste d'attente. */
  attachToGame(file: string, gameId: string, kind: NeedKind, back: () => void): void;
  /** « Chercher sur le web… » de cet écran ; un fichier reçu sans jeu ouvre le plan d'ajout. */
  web(screen: AddScreenId, back: () => void): Action;
  /** Tâche avec message d'attente (lecture d'une archive). */
  task(message: string, work: () => Promise<void> | void): Promise<void>;
  back(): void;
}

type Seen = Awaited<ReturnType<DownloadsScreenContext['inspect']>>;

/** Ce qu'on peut reprendre par l'ajout d'une table : table, fronton, ROM, archive, média. */
const INSTALLABLE = new Set(['table', 'b2s', 'rom', 'archive', 'image', 'video', 'audio']);

export function createDownloadsScreen(ctx: DownloadsScreenContext) {
  let sort: DownloadSort = 'date';
  let windows = false;
  let flash: { text: string; tone: Tone } | undefined;
  /** « Retour » de la liste : l'écran qui l'a ouverte (le gestionnaire de téléchargements). */
  let leave = () => ctx.back();
  /** Contenu de chaque fichier ouvert, lu une fois. */
  const seenOf = new Map<string, Seen>();

  const flashSection = (): Section[] => (flash ? [{ rows: [{ text: flash.text, tone: flash.tone }] }] : []);

  function open(at?: number): void {
    ctx.show(() => buildList(), at);
  }

  function buildList(): Built {
    const all = ctx.inventory(windows);
    const mine = sortDownloads(emptiableDownloads(all), sort);
    const theirs = sortDownloads(all.filter((e) => e.outside), sort);
    const actions: Action[] = [];
    const row = (e: DownloadEntry): Row => {
      const action = actions.length;
      actions.push({ label: e.label ?? e.name, run: () => openFile(e.file) });
      return { text: e.label ?? e.name, detail: downloadLine(e), badges: [DOWNLOAD_KIND_LABELS[e.kind]], note: useNote(e), action, pick: true };
    };
    const sections: Section[] = [...flashSection()];
    sections.push({
      title: t('Cyber Pinball · {order}', { order: sort === 'date' ? t('du plus récent au plus ancien') : sort === 'name' ? t('par nom') : t('du plus gros au plus petit') }),
      rows: mine.length ? mine.map(row) : [{ text: t('Aucun téléchargement'), detail: t('Ce que Cyber Pinball télécharge (tables, ROM, médias, mises à jour) sera gardé ici.'), tone: 'quiet' }],
    });
    if (windows)
      sections.push({
        title: t('Téléchargements de Windows · 30 derniers jours'),
        rows: theirs.length ? theirs.map(row) : [{ text: t('Rien de récent'), detail: t('Aucun fichier arrivé depuis un mois dans ce dossier.'), tone: 'quiet' }],
      });
    const next = DOWNLOAD_SORTS[(DOWNLOAD_SORTS.indexOf(sort) + 1) % DOWNLOAD_SORTS.length]!;
    actions.push(
      { label: t('Trier : {sort}', { sort: DOWNLOAD_SORT_LABELS[sort] }), detail: t('Puis : {next}', { next: DOWNLOAD_SORT_LABELS[next] }), icon: 'sort', run: () => ((sort = next), showAt('sort')) },
      {
        label: windows ? t('Masquer Téléchargements de Windows') : t('Afficher Téléchargements de Windows'),
        detail: windows ? tn(theirs.length, '{n} fichier récent', '{n} fichiers récents') : t('Les fichiers des 30 derniers jours, ici même'),
        icon: 'folder-download',
        run: () => ((windows = !windows), showAt('folder-download')),
      },
    );
    if (mine.length) actions.push({ label: t('Tout vider'), detail: t('{summary} : corbeille de Cyber Pinball', { summary: downloadsSummary(mine) }), icon: 'trash', tone: 'error', run: () => confirmEmpty() });
    actions.push(ctx.web('downloads', () => open()));
    actions.push({ label: t('Retour'), icon: 'back', run: () => leave() });
    const { count, bytes } = downloadTotals(mine);
    return {
      heading: t('Fichiers téléchargés'),
      icon: 'folder-download',
      subheading: [tn(count, '{n} fichier', '{n} fichiers'), formatSize(bytes)].join(' · '),
      lead: t('Tout ce que Cyber Pinball a téléchargé, gardé pour le reprendre sans le télécharger de nouveau. Ce que vous retirez part dans la corbeille de Cyber Pinball.'),
      sections,
      actions,
      back: () => leave(),
      variant: 'downloads',
    };
  }

  /** Redessine la liste, le curseur sur le geste qu'on vient d'utiliser (ses lignes ont pu changer de nombre). */
  function showAt(icon: 'sort' | 'folder-download'): void {
    flash = undefined;
    ctx.show(() => buildList(), Math.max(0, buildList().actions.findIndex((a) => a.icon === icon)));
  }

  function find(file: string): DownloadEntry | undefined {
    return ctx.inventory(true).find((e) => e.file.toLowerCase() === file.toLowerCase());
  }

  function openFile(file: string): void {
    flash = undefined;
    const key = file.toLowerCase();
    if (seenOf.has(key)) return ctx.show(() => buildFile(file));
    void ctx.task(t('Lecture du fichier…'), async () => {
      seenOf.set(key, await ctx.inspect(file));
      ctx.show(() => buildFile(file));
    });
  }

  /** Parties qu'apporte un fichier : « PuP-Pack », « Table, Fronton ». */
  const partsOf = (seen: Seen | undefined): NeedKind[] => (seen ? (seen.parts ?? (seen.content === 'unknown' ? [] : [seen.content])) : []);
  const partsText = (parts: NeedKind[]) => formatList(parts.map((k) => NEED_LABELS[k]));

  function buildFile(file: string): Built {
    const e = find(file);
    const back = () => open();
    if (!e) return { heading: t('Fichier introuvable'), sections: [{ rows: [{ text: path.basename(file), detail: t('Déplacé ou effacé depuis.'), tone: 'quiet' }] }], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
    const note = useNote(e)!;
    const rows: Row[] = [
      { text: t('Nom'), detail: e.name },
      { text: t('Nature'), detail: DOWNLOAD_KIND_LABELS[e.kind] },
      { text: t('Taille'), detail: formatSize(e.size) },
      { text: t('Reçu le'), detail: formatDateTime(e.mtimeMs) },
      { text: t('Provenance'), detail: [e.source, DOWNLOAD_ORIGIN_LABELS[e.origin]].filter(Boolean).join(' · ') },
    ];
    if (e.url) rows.push({ text: t('Adresse'), detail: e.url });
    const seen = seenOf.get(file.toLowerCase());
    const parts = partsOf(seen);
    if (seen) rows.push({ text: t('Contient'), detail: [CONTENT_LABELS[seen.content], seen.summary].filter(Boolean).join(' : ') });
    const sug = ctx.suggest(e.file);
    if (sug.table ?? sug.game) rows.push({ text: t('Jeu'), detail: sug.table?.title ?? sug.game!.label });
    rows.push({ text: t('Usage'), detail: `${note.sign} ${note.text}`, tone: note.tone === 'quiet' ? undefined : note.tone });
    rows.push({ text: t('Emplacement'), detail: path.dirname(e.file) });
    const actions: Action[] = [];
    if (INSTALLABLE.has(e.kind)) {
      // Le jeu probable d'abord, dans la partie que dit son contenu ; puis n'importe quel autre jeu.
      if (sug.table) {
        const table = sug.table;
        actions.push({ label: t('Ajouter à {title}', { title: table.title }), detail: parts.length ? t('{parts} · plan à valider ; le fichier reste ici', { parts: partsText(parts) }) : t('Plan à valider ; le fichier reste ici'), icon: 'table-add', tone: 'ok', run: () => ctx.addToTable([e.file], table) });
      } else if (sug.game && parts[0]) {
        const game = sug.game;
        const part = parts[0];
        actions.push({ label: t('Rattacher à {game}', { game: game.label }), detail: t('{part} · liste d’attente', { part: NEED_LABELS[part] }), icon: 'inbox', tone: 'ok', run: () => ctx.attachToGame(e.file, game.gameId, part, () => openFile(file)) });
      }
      actions.push({ label: t('Ajouter à un autre jeu…'), detail: t('Une table installée, ou un jeu attendu'), icon: 'tables', run: () => openGames(e) });
      if (!seen || seen.content === 'unknown' || parts.includes('table')) actions.push({ label: t('Installer comme nouvelle table'), detail: t('Plan d’ajout à valider ; le fichier reste ici'), icon: 'table-add', run: () => ctx.install([e.file]) });
    }
    actions.push({
      label: t('Mettre à la corbeille'),
      detail: e.outside ? t('Retiré de Téléchargements de Windows, gardé dans la corbeille de Cyber Pinball') : t('Corbeille de Cyber Pinball'),
      icon: 'trash',
      tone: 'error',
      run: () => (e.use.state === 'waiting' ? confirm([e], () => openFile(file)) : remove([e])),
    });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return { heading: e.label ?? e.name, icon: 'download', subheading: downloadLine(e), sections: [...flashSection(), { rows }], actions, back, variant: 'facts' };
  }

  /** Ajouter à un jeu : le probable d'abord, puis les tables installées, puis les jeux de la liste d'attente. */
  function openGames(e: DownloadEntry): void {
    const back = () => openFile(e.file);
    const parts = partsOf(seenOf.get(e.file.toLowerCase()));
    ctx.show(() => {
      const sug = ctx.suggest(e.file);
      const tables = ctx.tables().sort((a, b) => Number(b === sug.table) - Number(a === sug.table) || a.title.localeCompare(b.title, 'fr'));
      const games = ctx.games().filter((g) => !tables.some((x) => knownVpsId(x.info) === g.gameId));
      const actions: Action[] = [];
      const tableRows: Row[] = tables.map((x) => {
        const action = actions.length;
        actions.push({ label: x.title, run: () => ctx.addToTable([e.file], x) });
        return { text: x.title, detail: x === sug.table ? t('probable · table installée') : t('table installée'), tone: x === sug.table ? 'ok' : undefined, action, pick: true };
      });
      const gameRows: Row[] = games.map((g) => {
        const action = actions.length;
        const part = parts[0];
        actions.push({ label: g.label, run: () => (part ? ctx.attachToGame(e.file, g.gameId, part, () => openGames(e)) : openPart(e, g)) });
        return { text: g.label, detail: part ? t('liste d’attente · {part}', { part: NEED_LABELS[part] }) : t('liste d’attente · partie à choisir'), action, pick: true };
      });
      actions.push(ctx.web('downloads.games', () => openGames(e)));
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      const sections: Section[] = [];
      if (tableRows.length) sections.push({ title: t('Tables installées'), rows: tableRows });
      if (gameRows.length) sections.push({ title: t('Jeux attendus'), rows: gameRows });
      if (!sections.length) sections.push({ rows: [{ text: t('Aucune table installée, aucun jeu attendu'), tone: 'quiet' }] });
      return {
        heading: t('Ajouter à un jeu'),
        icon: 'download',
        subheading: parts.length ? `${e.name} · ${partsText(parts)}` : e.name,
        lead: t('Le jeu d’abord ; la partie est celle que dit le contenu. Une table installée reçoit le fichier par le plan d’ajout, à valider ; un jeu attendu le reçoit dans sa liste d’attente.'),
        sections,
        actions,
        back,
      };
    }, 0);
  }

  /** Contenu illisible : la partie du jeu attendu à laquelle le rattacher. */
  function openPart(e: DownloadEntry, game: { gameId: string; label: string }): void {
    const back = () => openGames(e);
    ctx.show(
      () => ({
        heading: t('Quelle partie ?'),
        icon: 'download',
        subheading: `${e.name} · ${game.label}`,
        lead: t('Le contenu de ce fichier n’a pas pu être lu : dites ce qu’il est. Le plan vérifiera avant d’installer.'),
        sections: [],
        actions: [...PART_KINDS.map((k): Action => ({ label: NEED_LABELS[k], run: () => ctx.attachToGame(e.file, game.gameId, k, back) })), { label: t('Retour'), icon: 'back', run: back }],
        back,
      }),
      0,
    );
  }

  /** Confirmation de « Tout vider » : ce qui part, ce que la liste d'attente perd ; le curseur sur Annuler. */
  function confirmEmpty(): void {
    const mine = emptiableDownloads(ctx.inventory(false));
    confirm(mine, () => open());
  }

  function confirm(entries: DownloadEntry[], cancel: () => void): void {
    flash = undefined;
    ctx.show(() => {
      const waiting = entries.filter((e) => e.use.state === 'waiting');
      const rows: Row[] = [{ text: t('À la corbeille'), detail: downloadsSummary(entries) }];
      if (waiting.length)
        rows.push(
          { text: t('Attendent leur installation'), detail: waiting.map((e) => e.use.text.replace(/^[^:]+ ?: /, '')).join(' ; ') },
          { text: t('Liste d’attente'), detail: `! ${tn(waiting.length, 'Il redeviendra attendu dans la liste d’attente.', 'Ils redeviendront attendus dans la liste d’attente.')}`, tone: 'warning' },
        );
      if (entries.some((e) => e.use.state === 'installed')) rows.push({ text: t('Tables installées'), detail: t('Elles n’en ont plus besoin : leurs fichiers sont dans leur dossier.') });
      rows.push({ text: t('Corbeille'), detail: t('Rien n’est effacé : tout se retrouve dans {dir}.', { dir: ctx.layout()?.trash ?? '' }) });
      const all = entries.length > 1;
      return {
        heading: all ? t('Vider les téléchargements ?') : t('Mettre « {name} » à la corbeille ?', { name: entries[0]?.label ?? entries[0]?.name ?? '' }),
        icon: 'trash',
        sections: [{ rows }],
        actions: [
          { label: t('Annuler'), icon: 'close', run: cancel },
          { label: all ? tn(entries.length, 'Mettre le fichier à la corbeille', 'Mettre les {n} fichiers à la corbeille') : t('Mettre à la corbeille'), detail: downloadsSummary(entries), icon: 'trash', tone: 'error', run: () => remove(entries) },
        ],
        back: cancel,
        variant: 'facts',
      };
    }, 0);
  }

  function remove(entries: DownloadEntry[]): void {
    const l = ctx.layout();
    if (!l || !entries.length) return open();
    const moved = trashDownloads(
      entries.map((e) => e.file),
      { downloadsDir: l.downloads, trashRoot: l.trash, label: 'Téléchargements' }, // i18n-ignore : nom de dossier de la corbeille
    );
    const back = ctx.forget(moved);
    const done = tn(moved.length, '✓ {n} fichier mis dans la corbeille de Cyber Pinball.', '✓ {n} fichiers mis dans la corbeille de Cyber Pinball.');
    flash = { text: back ? `${done} ${tn(back, '{n} élément de la liste d’attente redevient attendu.', '{n} éléments de la liste d’attente redeviennent attendus.')}` : done, tone: 'ok' };
    open();
  }

  return {
    /** `back` : où ramène « Retour » (le gestionnaire de téléchargements) ; sans lui, le menu système. */
    open: (back?: () => void) => {
      leave = back ?? (() => ctx.back());
      flash = undefined;
      open();
    },
  };
}
