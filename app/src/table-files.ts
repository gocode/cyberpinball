// Section « Fichiers » de la fiche d'une table : tout ce que contient son dossier, fichier
// par fichier, groupé par sorte (table, fronton, ROM, PuP-Pack…), chacun avec sa taille,
// son dossier et son état ; aux boutons, les flippers parcourent la liste, qui défile, et
// Start ouvre le détail d'un fichier (chemin complet, date, lien vers la bibliothèque de
// ROM). La fiche n'en garde qu'un résumé borné : elle ne déborde plus, même avec 30
// fichiers et des noms longs. Inventaire : packages/core/src/tablecontents.ts.

import * as path from 'node:path';
import {
  formatDateTime,
  formatSize,
  KIND_LABELS,
  t,
  tableContents,
  tn,
  type FileKind,
  type Layout,
  type TableContents,
  type TableEntry,
  type TableFileEntry,
} from '@cyberpinball/core';
import type { Action, Built, Row, Section, Tone } from './library';
import type { ScriptResult } from './vbs';

export interface TableFilesContext {
  layout(): Layout | undefined;
  tablesDir(): string;
  find(file: string): TableEntry | undefined;
  /** Script de la table, s'il a déjà été lu (ROM demandées, dossier DMD). */
  script(table: TableEntry): ScriptResult | undefined;
  /** Affiche un écran décrit, le curseur sur l'action `at`. */
  show(build: () => Built, at?: number): void;
  sheet(table: TableEntry): void;
  doctor(table: TableEntry): void;
  roms(): void;
  leave(): void;
}

const TONES: Record<TableFileEntry['state'], Tone> = { ok: 'ok', info: 'info', warning: 'warning', error: 'error', quiet: 'quiet' };

/** Libellé d'une sorte dans la liste : « Script de remplacement », « ROM »… */
const kindLabel = (kind: FileKind) => (kind === 'other' ? t('Autres fichiers') : KIND_LABELS[kind]);

export function createTableFiles(ctx: TableFilesContext) {
  /** Inventaire du dossier d'une table (lu à l'ouverture, pas à chaque bouton). */
  function contentsOf(table: TableEntry): TableContents {
    const script = ctx.script(table);
    const facts = script && !('error' in script) ? { usesPinmame: script.usesPinmame, roms: script.roms, dmdFolder: script.dmdFolder } : undefined;
    return tableContents(table.file, { ownFolder: !samePathText(table.folder, ctx.tablesDir()), romLibrary: ctx.layout()?.roms, script: facts });
  }

  /** « 34 fichiers · 1,4 Go · 2 à vérifier » : détail de l'action de la fiche. */
  function summary(contents: TableContents): string {
    return [tn(contents.files, '{n} fichier', '{n} fichiers'), formatSize(contents.size), contents.problems ? tn(contents.problems, '{n} à vérifier', '{n} à vérifier') : undefined].filter(Boolean).join(' · ');
  }

  /** Liste des fichiers ; `at` : l'action sur laquelle revenir (le fichier dont on sort). */
  function open(table: TableEntry, at = 0, contents = contentsOf(table)): void {
    ctx.show(() => build(table.file, contents), at);
  }

  function build(file: string, contents: TableContents): Built {
    const table = ctx.find(file);
    if (!table) return { heading: t('Table introuvable'), sections: [], actions: [{ label: t('Retour au menu'), run: ctx.leave }], back: ctx.leave };
    const back = () => ctx.sheet(table);
    const actions: Action[] = [];
    // Une section par sorte, dans l'ordre de l'inventaire (la table, ses frontons, ses ROM…).
    const groups = new Map<FileKind, Row[]>();
    for (const entry of contents.entries) {
      const index = actions.length;
      actions.push({ label: entry.name, run: () => openEntry(table, contents, entry, index) });
      if (!groups.has(entry.kind)) groups.set(entry.kind, []);
      groups.get(entry.kind)!.push(rowOf(entry, index));
    }
    const sections: Section[] = [...groups].map(([kind, rows]) => ({ title: `${kindLabel(kind)} · ${rows.length}`, rows }));
    if (!contents.entries.length) sections.push({ rows: [{ text: t('Dossier vide ou illisible'), detail: table.folder, tone: 'error' }] });
    if (contents.problems) actions.push({ label: t('Diagnostiquer et réparer'), detail: tn(contents.problems, '{n} fichier à vérifier', '{n} fichiers à vérifier'), tone: 'warning', run: () => ctx.doctor(table) });
    if (contents.entries.some((e) => e.kind === 'rom')) actions.push({ label: t('Bibliothèque de ROM'), detail: t('Chaque ROM, ses tables, sa taille'), run: ctx.roms });
    actions.push({ label: t('Retour à la fiche'), run: back });
    return {
      heading: t('Fichiers : {title}', { title: table.title }),
      subheading: summary(contents),
      lead: t('Dossier : {folder}', { folder: table.folder }),
      sections,
      actions,
      back,
      variant: 'files',
    };
  }

  function rowOf(entry: TableFileEntry, action: number): Row {
    const where = path.dirname(entry.rel);
    // La taille en fin de détail, pas en pastille : un nom long garde toute la largeur.
    const size = entry.missing ? undefined : entry.dir ? `${tn(entry.files ?? 0, '{n} fichier', '{n} fichiers')}, ${formatSize(entry.size)}` : formatSize(entry.size);
    return {
      text: entry.dir ? `${entry.name}${path.sep}` : entry.name,
      detail: [where !== '.' ? `${where}${path.sep}` : undefined, entry.note, size].filter(Boolean).join(' · '),
      badges: entry.missing ? [t('Absent')] : undefined,
      tone: TONES[entry.state],
      action,
      pick: true,
    };
  }

  /** Détail d'un fichier : chemin complet, taille, date, état, lien vers la bibliothèque. */
  function openEntry(table: TableEntry, contents: TableContents, entry: TableFileEntry, index: number): void {
    const back = () => open(table, index, contents);
    ctx.show(() => {
      const rows: Row[] = [
        { text: t('Type'), detail: entry.dir ? t('{kind} (dossier)', { kind: KIND_LABELS[entry.kind] }) : KIND_LABELS[entry.kind] },
        { text: t('Dossier'), detail: path.dirname(entry.path) },
        { text: t('Taille'), detail: entry.missing ? t('absent') : entry.dir ? `${formatSize(entry.size)} · ${tn(entry.files ?? 0, '{n} fichier', '{n} fichiers')}` : formatSize(entry.size) },
      ];
      if (entry.mtimeMs) rows.push({ text: t('Modifié le'), detail: formatDateTime(entry.mtimeMs) });
      rows.push({ text: t('État'), detail: entry.note.charAt(0).toUpperCase() + entry.note.slice(1), tone: TONES[entry.state] });
      if (entry.library) rows.push({ text: t('Bibliothèque'), detail: entry.library });
      const actions: Action[] = [];
      if (entry.kind === 'rom') actions.push({ label: t('Bibliothèque de ROM'), detail: t('Chaque ROM, ses tables, sa taille'), run: ctx.roms });
      if (entry.state === 'warning' || entry.state === 'error') actions.push({ label: t('Diagnostiquer et réparer'), tone: 'warning', run: () => ctx.doctor(table) });
      actions.push({ label: t('Retour aux fichiers'), run: back });
      return { heading: entry.name, subheading: `${KIND_LABELS[entry.kind]} · ${table.title}`, sections: [{ rows }], actions, back, variant: 'facts' };
    });
  }

  return { open, contentsOf, summary };
}

const samePathText = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

export type TableFiles = ReturnType<typeof createTableFiles>;
