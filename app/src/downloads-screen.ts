// Écran « Téléchargements » (menu système) : tout ce que Cyber Pinball a téléchargé,
// gardé sous <racine>\downloads pour le reprendre sans le télécharger de nouveau — d'où
// il vient, quand, sa taille, à quoi il sert. Un fichier s'ouvre (le reprendre pour une
// table, le mettre à la corbeille) ; « Tout vider » met toute la zone à la corbeille de
// Cyber Pinball, après confirmation. En option, les fichiers récents du dossier
// Téléchargements de Windows, montrés ici sans ouvrir l'explorateur.
// Cœur : packages/core/src/downloads.ts.

import * as path from 'node:path';
import {
  DOWNLOAD_KIND_LABELS,
  DOWNLOAD_ORIGIN_LABELS,
  DOWNLOAD_SORT_LABELS,
  DOWNLOAD_SORTS,
  downloadLine,
  downloadsSummary,
  downloadTotals,
  emptiableDownloads,
  formatDateTime,
  formatSize,
  sortDownloads,
  t,
  tn,
  trashDownloads,
  type DownloadEntry,
  type DownloadSort,
  type Layout,
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
  /** Reprendre un fichier pour l'ajouter (plan d'ajout d'une table). */
  install(paths: string[]): void;
  back(): void;
}

/** Ce qu'on peut reprendre par l'ajout d'une table : table, fronton, ROM, archive, média. */
const INSTALLABLE = new Set(['table', 'b2s', 'rom', 'archive', 'image', 'video', 'audio']);

export function createDownloadsScreen(ctx: DownloadsScreenContext) {
  let sort: DownloadSort = 'date';
  let windows = false;
  let flash: { text: string; tone: Tone } | undefined;

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
    actions.push({ label: t('Retour'), icon: 'back', run: () => ctx.back() });
    const { count, bytes } = downloadTotals(mine);
    return {
      heading: t('Téléchargements'),
      icon: 'download',
      subheading: [tn(count, '{n} fichier', '{n} fichiers'), formatSize(bytes)].join(' · '),
      lead: t('Tout ce que Cyber Pinball a téléchargé, gardé pour le reprendre sans le télécharger de nouveau. Ce que vous retirez part dans la corbeille de Cyber Pinball.'),
      sections,
      actions,
      back: () => ctx.back(),
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
    ctx.show(() => buildFile(file));
  }

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
    rows.push({ text: t('Usage'), detail: `${note.sign} ${note.text}`, tone: note.tone === 'quiet' ? undefined : note.tone });
    rows.push({ text: t('Emplacement'), detail: path.dirname(e.file) });
    const actions: Action[] = [];
    if (INSTALLABLE.has(e.kind)) actions.push({ label: t('Reprendre pour ajouter une table'), detail: t('Plan d’ajout à valider ; le fichier reste ici'), icon: 'table-add', run: () => ctx.install([e.file]) });
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

  return { open: () => ((flash = undefined), open()) };
}
