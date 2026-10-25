// Sélecteur de fichiers de Cyber Pinball, partout où l'on choisit un fichier ou un dossier
// sur ce PC (ajouter une table, un média, remplacer un fichier reçu, dossier d'un autre
// frontend) : à la place de la boîte de dialogue de Windows, qui s'ouvrait sur l'écran
// principal et ne se pilotait pas aux boutons de la borne. C'est un écran de gestion comme
// les autres : il s'affiche là où l'on est, aux flippers, à la souris ou au clavier.
// Cœur : packages/core/src/filepicker.ts (emplacements, filtres, contenu d'un dossier).
//
// Emplacements d'abord, puis le contenu du lieu ouvert, puis les gestes. Les
// téléchargements de Cyber Pinball sont proposés en premier quand ils ont ce qu'on
// cherche : on reprend un fichier déjà reçu sans le télécharger de nouveau.

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import {
  DOWNLOAD_KIND_LABELS,
  downloadLine,
  filterExtensions,
  formatDate,
  formatSize,
  insideDownloads,
  listFolder,
  matchesFilter,
  noteDownloadUse,
  parentWithin,
  parseDrives,
  pickerPlaces,
  readJsonFile,
  shortPath,
  t,
  tn,
  toggleSelection,
  type DownloadEntry,
  type DriveInfo,
  type IconName,
  type Layout,
  type PickFilter,
  type PickerPlace,
} from '@cyberpinball/core';
import type { Action, Built, Row, Section, Tone } from './library';

export interface PickRequest {
  /** « Ajouter une table : choisir », « Fronton : choisir un fichier ». */
  title: string;
  icon?: IconName;
  /** À quoi servira le fichier, noté dans le journal des téléchargements : « Ajout d’une table ». */
  purpose: string;
  /** Ce qu'on attend ; absent : tous les fichiers. */
  filter?: PickFilter;
  /** Un fichier, plusieurs, un dossier, ou des fichiers et un dossier entier (ajout d'une table). */
  mode: 'file' | 'files' | 'folder' | 'files-or-folder';
  /** Où ouvrir : les téléchargements de Cyber Pinball par défaut quand ils ont ce qu'on cherche. */
  start?: 'cp' | 'windows' | 'import' | 'desktop';
  done(paths: string[]): void;
  cancel(): void;
}

export interface FilePickerContext {
  layout(): Layout | undefined;
  show(build: () => Built, at?: number): void;
  cursor(): number;
  /** Inventaire des téléchargements de Cyber Pinball (sans ceux de Windows). */
  inventory(): DownloadEntry[];
  /** Dossier Téléchargements de Windows (essais : un dossier du bac à sable). */
  windowsDownloads?(): string;
  /** Bureau (essais : un dossier du bac à sable). */
  desktop?(): string;
  broadcast(): void;
}

/**
 * Lecteurs de ce PC (Win32_LogicalDisk), relus au plus toutes les 15 secondes : une clé
 * branchée apparaît à l'ouverture suivante. CYBERPINBALL_LECTEURS (essais) : un fichier
 * JSON ou du JSON, liste de DriveInfo avec leur `path` dans le bac à sable.
 */
let drivesCache: { at: number; drives: DriveInfo[] } | undefined;
export function listDrives(): Promise<DriveInfo[]> {
  const fake = process.env.CYBERPINBALL_LECTEURS;
  if (fake) {
    try {
      const raw = fake.trim().startsWith('[') ? JSON.parse(fake) : readJsonFile(fake);
      return Promise.resolve(Array.isArray(raw) ? (raw as DriveInfo[]) : []);
    } catch {
      return Promise.resolve([]);
    }
  }
  if (drivesCache && Date.now() - drivesCache.at < 15_000) return Promise.resolve(drivesCache.drives);
  return new Promise((resolve) => {
    const script = 'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,DriveType,VolumeName,FreeSpace,Size | ConvertTo-Json -Compress';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 8000 }, (error, stdout) => {
      let drives: DriveInfo[] = [];
      try {
        if (!error && stdout.trim()) drives = parseDrives(JSON.parse(stdout));
      } catch {
        drives = [];
      }
      // Sans PowerShell : les lettres qui répondent, comme des disques.
      if (!drives.length) {
        for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') if (fs.existsSync(`${letter}:\\`)) drives.push({ letter: `${letter}:`, type: 'fixed' });
      }
      drivesCache = { at: Date.now(), drives };
      resolve(drives);
    });
  });
}

type Place = PickerPlace;

interface PickerState {
  request: PickRequest;
  places: Place[];
  place: Place;
  /** Dossier ouvert (emplacements qui sont des dossiers). */
  dir?: string;
  selected: string[];
  showAll: boolean;
  sort: 'name' | 'date';
  flash?: { text: string; tone: Tone };
}

const day = (ms: number) => formatDate(ms, { day: 'numeric', month: 'short', year: 'numeric' });

export function createFilePicker(ctx: FilePickerContext) {
  let state: PickerState | undefined;

  const windowsDir = () => ctx.windowsDownloads?.() ?? app.getPath('downloads');
  const desktopDir = () => ctx.desktop?.() ?? app.getPath('desktop');

  /** Ce que l'emplacement « Cyber Pinball » propose : l'inventaire, filtré. */
  function cpEntries(s: PickerState): { shown: DownloadEntry[]; hidden: number } {
    if (s.request.mode === 'folder') return { shown: [], hidden: 0 };
    const all = ctx.inventory();
    const shown = s.showAll ? all : all.filter((e) => matchesFilter(e.name, s.request.filter));
    const sorted = s.sort === 'name' ? [...shown].sort((a, b) => (a.label ?? a.name).localeCompare(b.label ?? b.name, undefined, { sensitivity: 'base', numeric: true })) : shown;
    return { shown: sorted, hidden: all.length - shown.length };
  }

  async function open(request: PickRequest): Promise<void> {
    const l = ctx.layout();
    const drives = await listDrives();
    const count = l ? ctx.inventory().length : 0;
    const places = pickerPlaces({ cpDownloads: l ? { count } : undefined, windowsDownloads: windowsDir(), importDir: l?.import, desktop: desktopDir(), drives });
    const s: PickerState = { request, places, place: places[0]!, selected: [], showAll: false, sort: 'date' };
    // Les téléchargements de Cyber Pinball d'abord, s'ils ont ce qu'on cherche ; sinon Téléchargements de Windows.
    const wanted = request.start ? places.find((p) => p.kind === ({ cp: 'cp-downloads', windows: 'windows-downloads', import: 'import', desktop: 'desktop' } as const)[request.start!]) : undefined;
    const cp = places.find((p) => p.kind === 'cp-downloads');
    const first = wanted ?? (cp && cpEntries({ ...s, place: cp }).shown.length ? cp : places.find((p) => p.kind === 'windows-downloads')) ?? places[0]!;
    state = s;
    enter(s, first);
  }

  /** Ouvre un emplacement ; le curseur va sur la première ligne du contenu. */
  function enter(s: PickerState, place: Place, dir = place.path): void {
    s.place = place;
    s.dir = dir;
    s.flash = undefined;
    ctx.show(() => build(s), s.places.length);
  }

  function openDir(s: PickerState, dir: string): void {
    s.dir = dir;
    s.flash = undefined;
    ctx.show(() => build(s), s.places.length);
  }

  function finish(s: PickerState, paths: string[]): void {
    const missing = paths.filter((p) => !fs.existsSync(p));
    if (missing.length) {
      s.selected = s.selected.filter((p) => !missing.includes(p));
      s.flash = { text: t('Introuvable désormais : {files}. Choisissez de nouveau.', { files: missing.map((p) => path.basename(p)).join(', ') }), tone: 'error' };
      return ctx.broadcast();
    }
    const l = ctx.layout();
    if (l) for (const p of paths) if (insideDownloads(l.downloads, p)) noteDownloadUse(l.downloads, p, s.request.purpose);
    state = undefined;
    s.request.done(paths);
  }

  function back(s: PickerState): void {
    if (s.dir && s.place.kind !== 'cp-downloads') {
      // Un lecteur se remonte jusqu'à sa racine ; un dossier (Téléchargements, Bureau, import) jusqu'à lui-même.
      const up = parentWithin(s.dir, s.place.kind === 'drive' ? undefined : s.place.path);
      if (up) return openDir(s, up);
    }
    state = undefined;
    s.request.cancel();
  }

  function build(s: PickerState): Built {
    const r = s.request;
    const multiple = r.mode === 'files' || r.mode === 'files-or-folder';
    const actions: Action[] = [];
    const sections: Section[] = [];
    if (s.flash) sections.push({ kind: 'flash', rows: [{ text: s.flash.text, tone: s.flash.tone }] });

    // Emplacements : des lignes à choisir, l'ouvert repéré.
    const placeRows: Row[] = s.places.map((p) => {
      const action = actions.length;
      actions.push({ label: p.label, detail: p.detail, icon: p.icon, run: () => enter(s, p) });
      return { text: p.label, detail: p.kind === 'drive' || p.kind === 'cp-downloads' ? p.detail : p.kind === 'windows-downloads' ? 'Windows' : undefined, icon: p.icon, action, pick: true, current: p.id === s.place.id };
    });
    sections.push({ kind: 'places', title: t('Emplacements'), rows: placeRows });

    const rows: Row[] = [];
    let title: string;
    let hidden = 0;
    let error: string | undefined;
    if (s.place.kind === 'cp-downloads') {
      title = t('Téléchargements de Cyber Pinball');
      const { shown, hidden: h } = cpEntries(s);
      hidden = h;
      for (const e of shown) rows.push(fileRow(s, e.file, { name: e.label ?? e.name, kind: DOWNLOAD_KIND_LABELS[e.kind], detail: downloadLine(e), matches: matchesFilter(e.name, r.filter), note: useNote(e) }, actions, multiple));
    } else {
      const dir = s.dir!;
      title = path.basename(dir) || dir;
      const listing = listFolder(dir, { filter: r.filter, showAll: s.showAll, sort: s.sort, foldersOnly: r.mode === 'folder' });
      hidden = listing.hidden;
      error = listing.error;
      for (const e of listing.entries) {
        if (e.dir) {
          const action = actions.length;
          actions.push({ label: e.name, run: () => openDir(s, e.path) });
          rows.push({ text: e.name, detail: t('Dossier · {date}', { date: day(e.mtimeMs) }), icon: 'folder', action, pick: true });
        } else rows.push(fileRow(s, e.path, { name: e.name, kind: DOWNLOAD_KIND_LABELS[e.kind], detail: `${formatSize(e.size)} · ${day(e.mtimeMs)}`, matches: e.matches }, actions, multiple));
      }
    }
    if (error) rows.push({ text: error, detail: t('Choisissez un autre emplacement, ou « Réessayer » une fois la clé rebranchée.'), tone: 'warning' });
    else if (!rows.length) {
      rows.push(
        hidden
          ? { text: t('Aucun fichier qui convienne'), detail: tn(hidden, '{n} fichier caché : il ne convient pas ici. « Afficher tous les fichiers » le montre.', '{n} fichiers cachés : ils ne conviennent pas ici. « Afficher tous les fichiers » les montre.'), tone: 'quiet' }
          : s.place.kind === 'cp-downloads'
            ? { text: t('Aucun téléchargement pour le moment'), detail: t('Ce que Cyber Pinball télécharge est gardé ici. Essayez Téléchargements de Windows, une clé USB…'), tone: 'quiet' }
            : { text: r.mode === 'folder' ? t('Aucun sous-dossier') : t('Ce dossier est vide'), tone: 'quiet' },
      );
    } else if (hidden) rows.push({ text: tn(hidden, '{n} autre fichier caché : il ne convient pas ici', '{n} autres fichiers cachés : ils ne conviennent pas ici'), tone: 'quiet' });
    sections.push({ kind: 'entries', title, rows });

    // Gestes.
    const gestures: Action[] = [];
    if (multiple) {
      const n = s.selected.length;
      gestures.push(
        n
          ? { label: tn(n, 'Prendre le fichier choisi', 'Prendre les {n} fichiers choisis'), detail: s.selected.map((f) => path.basename(f)).slice(0, 3).join(', ') + (n > 3 ? '…' : ''), icon: 'check', tone: 'ok', run: () => finish(s, [...s.selected]) }
          : { label: t('Prendre les fichiers choisis'), detail: t('Choisissez au moins un fichier : Start le coche'), icon: 'check', tone: 'quiet', run: () => undefined },
      );
    }
    if ((r.mode === 'folder' || r.mode === 'files-or-folder') && s.dir && s.place.kind !== 'cp-downloads' && !error)
      gestures.push({ label: t('Prendre ce dossier entier'), detail: t('« {name} » et ses sous-dossiers', { name: path.basename(s.dir) || s.dir }), icon: 'folder', tone: r.mode === 'folder' ? 'ok' : undefined, run: () => finish(s, [s.dir!]) });
    const up = s.dir && s.place.kind !== 'cp-downloads' ? parentWithin(s.dir, s.place.kind === 'drive' ? undefined : s.place.path) : undefined;
    if (up) gestures.push({ label: t('Dossier parent'), detail: shortPath(up, 48), icon: 'chevron-left', run: () => openDir(s, up) });
    if (r.filter && r.mode !== 'folder') gestures.push({ label: s.showAll ? t('Seulement ce qui convient') : t('Afficher tous les fichiers'), detail: s.showAll ? r.filter.label : t('Filtre : {label}', { label: r.filter.label }), icon: 'filter', run: () => ((s.showAll = !s.showAll), ctx.broadcast()) });
    gestures.push({ label: s.sort === 'date' ? t('Trier par nom') : t('Trier par date'), detail: s.sort === 'date' ? t('Aujourd’hui : les plus récents d’abord') : t('Aujourd’hui : par nom'), icon: 'sort', run: () => ((s.sort = s.sort === 'date' ? 'name' : 'date'), ctx.broadcast()) });
    if (error) gestures.push({ label: t('Réessayer'), icon: 'refresh', run: () => openDir(s, s.dir!) });
    gestures.push({ label: t('Annuler'), icon: 'close', run: () => ((state = undefined), r.cancel()) });
    actions.push(...gestures);

    const where = s.place.kind === 'cp-downloads' ? t('Téléchargements de Cyber Pinball') : shortPath(s.dir!, 70);
    const chosen = multiple && s.selected.length ? tn(s.selected.length, '{n} fichier choisi', '{n} fichiers choisis') : undefined;
    return {
      heading: r.title,
      icon: r.icon ?? 'folder',
      subheading: [where, chosen].filter(Boolean).join(' · '),
      lead:
        r.mode === 'folder'
          ? t('Start ouvre un dossier ; « Prendre ce dossier entier » le choisit. Exit remonte d’un dossier.')
          : r.filter
            ? t('Filtre : {label} ({ext}). {how}', { label: r.filter.label, ext: filterExtensions(r.filter), how: multiple ? t('Start coche un fichier ou ouvre un dossier.') : t('Start prend le fichier ou ouvre le dossier.') })
            : multiple
              ? t('Start coche un fichier ou ouvre un dossier.')
              : t('Start prend le fichier ou ouvre le dossier.'),
      sections,
      actions,
      back: () => back(s),
      variant: 'picker',
      hint: up || s.place.kind === 'drive' ? t('Flippers : choisir · Start : ouvrir, cocher ou prendre · Exit : dossier parent') : t('Flippers : choisir · Start : ouvrir, cocher ou prendre · Exit : annuler'),
      // Glisser un fichier sur la fenêtre : il est pris comme s'il avait été choisi.
      drop: (paths) => {
        const ok = paths.filter((p) => r.mode === 'folder' ? fs.existsSync(p) && fs.statSync(p).isDirectory() : matchesFilter(p, r.filter));
        if (ok.length) finish(s, multiple ? ok : ok.slice(0, 1));
      },
    };
  }

  /** Ligne d'un fichier : coché (plusieurs), pris (un seul), ou qui ne convient pas. */
  function fileRow(s: PickerState, file: string, f: { name: string; kind: string; detail: string; matches: boolean; note?: Row['note'] }, actions: Action[], multiple: boolean): Row {
    const action = actions.length;
    const chosen = s.selected.some((p) => p.toLowerCase() === file.toLowerCase());
    actions.push({
      label: f.name,
      run: () => {
        if (!f.matches) {
          s.flash = { text: t('« {name} » ne convient pas ici ({label}).', { name: f.name, label: s.request.filter?.label ?? '' }), tone: 'warning' };
          return ctx.broadcast();
        }
        if (!multiple) return finish(s, [file]);
        s.selected = toggleSelection(s.selected, file, true);
        s.flash = undefined;
        ctx.broadcast();
      },
    });
    const badges = [f.kind];
    if (chosen) badges.push(t('✓ Choisi'));
    if (!f.matches) badges.push(t('Ne convient pas'));
    return { text: f.name, detail: f.detail, badges, tone: f.matches ? undefined : 'quiet', action, pick: true, current: chosen, note: f.note };
  }

  return {
    /** Ouvre le sélecteur ; `done` reçoit les chemins choisis, `cancel` est appelé à l'abandon. */
    open: (request: PickRequest) => void open(request),
    /** Le sélecteur est-il ouvert (pour ne pas en empiler deux) ? */
    isOpen: () => state !== undefined,
  };
}

/** À quoi sert un téléchargement : mot et signe, jamais la couleur seule. */
export function useNote(e: DownloadEntry): Row['note'] {
  switch (e.use.state) {
    case 'installed':
    case 'used':
      return { text: e.use.text, sign: '✓', tone: 'ok' };
    case 'waiting':
      return { text: e.use.text, sign: '!', tone: 'warning' };
    case 'kept':
      return { text: e.use.text, sign: 'i', tone: 'info' };
    default:
      return { text: e.use.text, sign: '○', tone: 'quiet' };
  }
}
