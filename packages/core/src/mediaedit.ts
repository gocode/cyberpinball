// Gestionnaire des médias d'un jeu (écran « Médias » de la fiche, tâche T8 de
// docs/recherche/medias.md) : où chaque média s'affiche, ce qui est montré
// aujourd'hui, et le plan des changements demandés. Rien n'est écrit avant que
// l'utilisateur ait validé le plan ; ce qui est remplacé ou retiré part à la
// corbeille (applyOps).
//
// Les changements sont un brouillon : pour chaque type touché, la liste voulue
// des pages (fichiers déjà là, ou fichiers à prendre dans le dossier d'import, sur
// ce PC ou glissés sur la fenêtre), plus les demi-tours et le volume relatif.
// planMediaChanges en déduit les opérations : les fichiers gardés sont renommés
// « (Type) <nom du dossier>[ N].ext » dans l'ordre voulu, les nouveaux y sont
// rangés sous ce nom, et tout autre fichier de ce type pour ce jeu va à la
// corbeille, pour que le menu montre exactement ce qui a été choisi.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileOp } from './fileops';
import { isInside, samePath } from './fileops';
import { type Cabinet } from './model';
import {
  dmdMediaType,
  isAcceptedFormat,
  mediaFileName,
  mediaMemory,
  mediaTypeFromFolder,
  mediaTypeFromVpinfe,
  mediaTypeInfo,
  MEDIA_TYPES,
  parseMediaFileName,
  resolveMedia,
  scanTableMedias,
  setMediaMemory,
  tableMediaDir,
  type MediaMemory,
  type MediaOrigin,
  type MediaType,
  type ResolveOptions,
  type ResolvedMedia,
} from './medias';
import { readInfo, type TableEntry } from './tables';

/** Types montrés par l'écran Médias : ceux qui ont un écran ou le son chez Cyber Pinball, dans l'ordre du catalogue. */
export const MANAGED_MEDIA_TYPES: readonly MediaType[] = MEDIA_TYPES.filter((t) => t.target).map((t) => t.type);

/** Volumes relatifs proposés, en pour cent ; 100 : comme les autres jeux. */
export const MEDIA_VOLUME_STEPS: readonly number[] = [0, 25, 50, 75, 100, 125, 150, 200];

// ---------------------------------------------------------------------------
// Où s'affiche chaque média

/**
 * Où et quand le média apparaît, en clair : l'écran de la borne, puis le moment.
 * C'est ce qui manque le plus chez Popper, où l'on voit « Other2 » ou « Menu »
 * sans savoir sur quel écran ni quand.
 */
const WHERE: Record<MediaType, string> = {
  Wheel: 'Écran du plateau, dans la liste des tables, et en mode attente',
  Playfield: 'Écran du plateau, en fond derrière la liste des tables, et en mode attente',
  Backglass: 'Écran du fronton, tant que la table est choisie, au chargement, en mode attente, et en partie si VPX laisse l’écran libre',
  DMD: 'Écran de l’afficheur s’il est étroit (4:1), tant que la table est choisie, au chargement, en mode attente, et en partie si VPX laisse l’écran libre',
  FullDMD: 'Écran de l’afficheur s’il est large (16:9), tant que la table est choisie, au chargement, en mode attente, et en partie si VPX laisse l’écran libre',
  Topper: 'Écran du topper, au-dessus du fronton, tant que la table est choisie, au chargement, en mode attente, et en partie si VPX laisse l’écran libre',
  Loading: 'Écran du plateau, pendant que VPX charge la table, sous les commandes de la partie',
  Audio: 'Haut-parleurs, tant que la table est choisie dans la liste (si « Musique des jeux » est activée) et en mode attente (si son son est réduit)',
  AudioLaunch: 'Haut-parleurs, une fois, au lancement de la partie',
  GameInfo: 'Écran du plateau, depuis la fiche de la table, page par page',
  GameHelp: 'Écran du plateau, depuis la fiche de la table, page par page',
  Other: 'Nulle part : Cyber Pinball n’a pas d’écran « autre »',
  RealDMD: 'Nulle part : Cyber Pinball ne pilote pas de DMD physique',
  RealColorDMD: 'Nulle part : Cyber Pinball ne pilote pas de DMD physique',
};

export interface MediaPlacement {
  /** Écran et moment, en une phrase. */
  where: string;
  /** Le média apparaît-il sur cette borne ? (sans modèle de borne : on suppose que oui) */
  shown: boolean;
  /** Pourquoi il n'apparaît pas, ou à quelle condition. */
  note?: string;
}

const ROLE_SCREEN: Record<string, string> = {
  backglass: 'fronton',
  dmd: 'afficheur',
  topper: 'topper',
};

/** Où s'affiche ce type de média, et s'il apparaît sur la borne décrite par `cabinet`. */
export function mediaPlacement(type: MediaType, cabinet?: Cabinet): MediaPlacement {
  const info = mediaTypeInfo(type);
  const where = WHERE[info.type];
  if (!info.target) return { where, shown: false };
  if (!cabinet || info.target === 'playfield' || info.target === 'audio') return { where, shown: true };
  if (!cabinet.roles[info.target]) {
    return { where, shown: false, note: `Cette borne n’a pas d’écran ${ROLE_SCREEN[info.target]} : ce média n’est montré nulle part.` };
  }
  if (type === 'DMD' || type === 'FullDMD') {
    const used = dmdMediaType(cabinet);
    if (used && used !== type) {
      return {
        where,
        shown: false,
        note:
          used === 'DMD'
            ? 'L’afficheur de cette borne est étroit (4:1) : il montre l’Afficheur ; celui-ci ne sert que si l’Afficheur manque.'
            : 'L’afficheur de cette borne est large (16:9) : il montre l’Afficheur large ; celui-ci ne sert que si l’Afficheur large manque.',
      };
    }
  }
  return { where, shown: true };
}

// ---------------------------------------------------------------------------
// Ce qui est là

/** Pages montrées aujourd'hui pour ce type, trouvées dans medias\ du jeu (étapes 1 à 3 du § 5.3) ; vide sinon. */
export function ownMediaPages(table: TableEntry, root: string, type: MediaType, options: ResolveOptions = {}): string[] {
  const resolved = resolveMedia(table, root, type, options);
  const own = resolved.source === 'vpx-name' || resolved.source === 'folder-name' || resolved.source === 'vpinfe';
  // Un afficheur peut être servi par l'autre type (FullDMD réduit) : ce n'est pas le sien.
  return own && resolved.foundType === mediaTypeInfo(type).type ? resolved.files : [];
}

/**
 * Tous les fichiers de medias\ qui représentent ce type pour ce jeu : noms du .vpx
 * et du dossier (toutes les pages pour le prospectus et les règles, la première
 * sinon), noms de VPinFE, quel que soit le format. Quand le type est modifié, ceux
 * qui ne sont pas gardés vont à la corbeille : sinon l'un d'eux pourrait passer
 * devant le fichier choisi (une vidéo .mp4 passe avant une image .png).
 */
export function mediaCompetitors(table: TableEntry, type: MediaType): string[] {
  const info = mediaTypeInfo(type);
  return scanTableMedias(table)
    .filter((f) => f.type === info.type && f.match !== undefined && f.match !== 'other-name' && (info.pages || f.page === 1))
    .map((f) => f.file);
}

// ---------------------------------------------------------------------------
// Brouillon des changements

/** Une page voulue : un fichier déjà dans medias\, ou un fichier à y ranger. */
export type MediaPageEntry =
  | { file: string }
  /**
   * move : pris dans le dossier d'import ou téléchargé (il le quitte) ; copy : choisi
   * sur ce PC, glissé, ou pris dans le PuP-Pack de la table (l'original reste).
   * `origin` : provenance d'un fichier téléchargé, notée dans le .info à l'enregistrement.
   */
  | { from: string; mode: 'move' | 'copy'; origin?: MediaOriginDraft };

/** Provenance d'un fichier choisi en ligne ; la date et le nom rangé sont ajoutés à l'enregistrement. */
export type MediaOriginDraft = Omit<MediaOrigin, 'date' | 'file'>;

export interface MediaDraft {
  /** Pages voulues, dans l'ordre, pour chaque type modifié ; liste vide : plus de fichier. */
  pages: Partial<Record<MediaType, MediaPageEntry[]>>;
  /** Demi-tours voulus (médias orientables), seulement ceux qui changent. */
  halfTurn: Partial<Record<MediaType, boolean>>;
  /** Volume relatif voulu, en pour cent ; absent : inchangé. */
  volume?: number;
}

export function emptyMediaDraft(): MediaDraft {
  return { pages: {}, halfTurn: {} };
}

/** Pages voulues pour un type : celles du brouillon, sinon celles d'aujourd'hui. */
export function draftPages(draft: MediaDraft, type: MediaType, current: string[]): MediaPageEntry[] {
  return draft.pages[type] ?? current.map((file) => ({ file }));
}

/** Fichier source d'une page : le fichier gardé, ou celui à ranger. */
export function entrySource(entry: MediaPageEntry): string {
  return 'file' in entry ? entry.file : entry.from;
}

function sameEntries(a: MediaPageEntry[], b: MediaPageEntry[]): boolean {
  return a.length === b.length && a.every((e, i) => 'file' in e && 'file' in b[i]! && samePath(e.file, (b[i] as { file: string }).file));
}

/** Le brouillon change-t-il ce type par rapport à aujourd'hui ? */
export function isTypeChanged(draft: MediaDraft, type: MediaType, current: string[]): boolean {
  const wanted = draft.pages[type];
  return wanted !== undefined && !sameEntries(wanted, current.map((file) => ({ file })));
}

/**
 * Type d'un fichier d'après son nom, pour un dépôt sur l'écran Médias :
 * « (Wheel) n'importe quoi.png », nom de VPinFE (« bg.png »), ou dossier de Popper
 * ou de PinballX qui le contient (« Wheel\T2.png », « Backglass Images\T2.png »).
 * undefined si le nom ne dit rien, ou si le format ne convient pas au type.
 */
export function guessMediaType(file: string): MediaType | undefined {
  const name = path.basename(file);
  const parent = path.basename(path.dirname(file));
  const type = parseMediaFileName(name)?.type ?? mediaTypeFromVpinfe(name) ?? mediaTypeFromFolder('popper', parent) ?? mediaTypeFromFolder('pinballx', parent);
  return type && isAcceptedFormat(type, name) ? type : undefined;
}

// ---------------------------------------------------------------------------
// Plan

export type MediaStepKind = 'add' | 'rename' | 'trash' | 'info';

/** Ligne du plan, à montrer telle quelle avant validation. */
export interface MediaStep {
  kind: MediaStepKind;
  type?: MediaType;
  /** « logo.png → (Wheel) Terminator 2 (Williams 1991).png » */
  text: string;
  detail?: string;
}

export interface MediaPlan {
  ops: FileOp[];
  steps: MediaStep[];
  /** Fichier .info écrit, s'il change. */
  infoFile?: string;
  /** Raisons d'un plan impossible (fichier disparu, format refusé) ; rien n'est appliqué tant qu'il y en a. */
  problems: string[];
}

export interface MediaPlanContext {
  /** Fichier .info de la table (infoFileFor), lu et réécrit avec ses autres champs. */
  infoFile: string;
  /** Pages montrées aujourd'hui, par type (ownMediaPages) ; recalculées sinon. */
  current?: Partial<Record<MediaType, string[]>>;
  root?: string;
  /** Date notée avec la provenance d'un fichier téléchargé. */
  now?: Date;
}

const extOf = (file: string) => path.extname(file).slice(1).toLowerCase();

/** Nom provisoire dans medias\, le temps de renuméroter les pages sans en écraser une. */
function tempName(dir: string, index: number, file: string): string {
  return path.join(dir, `.cyberpinball-${process.pid}-${index}-${path.basename(file)}`);
}

/**
 * Opérations qui donnent au jeu les médias du brouillon. Dans l'ordre :
 * 1. corbeille des fichiers de ce type qui ne sont pas gardés ;
 * 2. renommage des fichiers gardés, en deux temps (nom provisoire, puis nom final)
 *    pour qu'une page renumérotée ne prenne jamais la place d'une autre ;
 * 3. fichiers nouveaux rangés sous leur nom final ;
 * 4. .info réécrit (demi-tours, volume, provenance des fichiers téléchargés), ses
 *    autres champs conservés.
 */
export function planMediaChanges(table: TableEntry, draft: MediaDraft, context: MediaPlanContext): MediaPlan {
  const dir = tableMediaDir(table);
  const trash: FileOp[] = [];
  const toTemp: FileOp[] = [];
  const fromTemp: FileOp[] = [];
  const incoming: FileOp[] = [];
  const steps: MediaStep[] = [];
  const problems: string[] = [];
  /** Types changés : pages voulues et leur nom final, pour la provenance notée dans le .info. */
  const placed = new Map<MediaType, { entry: MediaPageEntry; target: string }[]>();
  let temp = 0;
  const current = (type: MediaType) => context.current?.[type] ?? (context.root ? ownMediaPages(table, context.root, type) : []);

  for (const type of MANAGED_MEDIA_TYPES) {
    // Un fichier choisi qui est déjà dans medias\ (mal nommé) est renommé, pas copié.
    const wanted = draft.pages[type]?.map((e): MediaPageEntry => ('from' in e && isInside(e.from, dir) ? { file: e.from } : e));
    if (!wanted) continue;
    const now = current(type);
    if (sameEntries(wanted, now.map((file) => ({ file })))) continue;
    const info = mediaTypeInfo(type);
    if (!info.pages && wanted.length > 1) problems.push(`${info.label} : une seule image ou vidéo possible.`);
    const kept = wanted.filter((e): e is { file: string } => 'file' in e).map((e) => e.file);

    // 1. Ce qui n'est pas gardé : la page d'aujourd'hui et ses concurrents.
    const leaving = [...new Map([...now, ...mediaCompetitors(table, type)].map((f) => [f.toLowerCase(), f])).values()];
    for (const file of leaving) {
      if (kept.some((k) => samePath(k, file))) continue;
      trash.push({ op: 'trash', path: file });
      steps.push({ kind: 'trash', type, text: `${path.basename(file)} → corbeille`, detail: now.some((n) => samePath(n, file)) ? 'montré aujourd’hui' : 'même type, au nom de ce jeu' });
    }

    // 2 et 3. Pages dans l'ordre voulu, sous le nom « (Type) <dossier>[ N].ext ».
    placed.set(type, []);
    wanted.forEach((entry, i) => {
      const source = entrySource(entry);
      const page = info.pages ? i + 1 : 1;
      const target = path.join(dir, mediaFileName(table, type, extOf(source), page));
      placed.get(type)!.push({ entry, target });
      if (!isAcceptedFormat(type, source)) {
        problems.push(`${path.basename(source)} : format .${extOf(source)} non lu pour ${info.label} (${info.formats.join(', ')}).`);
        return;
      }
      if ('file' in entry) {
        if (path.basename(entry.file) === path.basename(target) && samePath(entry.file, target)) return;
        if (!fs.existsSync(entry.file)) problems.push(`${path.basename(entry.file)} a disparu de medias\\.`);
        const t = tempName(dir, temp++, entry.file);
        toTemp.push({ op: 'move', from: entry.file, to: t });
        fromTemp.push({ op: 'move', from: t, to: target });
        const was = now.findIndex((n) => samePath(n, entry.file));
        steps.push({
          kind: 'rename',
          type,
          text: `${path.basename(entry.file)} → ${path.basename(target)}`,
          detail: info.pages && was >= 0 && was !== i ? `la page ${was + 1} devient la page ${page}` : 'renommé au nom du dossier',
        });
        return;
      }
      if (!fs.existsSync(entry.from)) problems.push(`${path.basename(entry.from)} a disparu (${path.dirname(entry.from)}).`);
      incoming.push({ op: entry.mode, from: entry.from, to: target });
      steps.push({
        kind: 'add',
        type,
        text: `${entry.origin ? [entry.origin.origin, entry.origin.vpsId, entry.origin.key].filter(Boolean).join(' ') : path.basename(entry.from)} → ${path.basename(target)}`,
        detail: `${info.pages ? `page ${page}, ` : ''}${entry.origin ? `téléchargé depuis ${entry.origin.origin}` : entry.mode === 'move' ? 'déplacé depuis le dossier d’import' : 'copié, l’original reste en place'}`,
      });
    });
  }

  // 4. Mémoire de Cyber Pinball dans le .info.
  const info = readInfo(context.infoFile);
  const before = mediaMemory(info);
  const after = nextMemory(before, draft);
  const infoSteps: MediaStep[] = [];
  // Provenance : notée pour un fichier téléchargé, suivie quand le fichier est renommé,
  // retirée quand il est remplacé ou mis à la corbeille (elle ne vaudrait plus).
  const sources = { ...before.sources };
  const turns = { ...after.halfTurn };
  for (const [type, pages] of placed) {
    const old = sources[type];
    const first = pages[0];
    if (pages.length === 1 && first && 'from' in first.entry && first.entry.origin) {
      sources[type] = { ...first.entry.origin, date: (context.now ?? new Date()).toISOString(), file: path.basename(first.target) };
      infoSteps.push({ kind: 'info', type, text: `Provenance notée : ${first.entry.origin.origin}`, detail: first.entry.origin.url });
      // Fichier téléchargé : au standard (paysage, flippers à droite), le demi-tour de l'ancien ne vaut plus.
      if (mediaTypeInfo(type).orientable && draft.halfTurn[type] === undefined) delete turns[type];
      continue;
    }
    const kept = old?.file ? pages.find((p) => 'file' in p.entry && path.basename(p.entry.file).toLowerCase() === old.file!.toLowerCase()) : undefined;
    if (kept) sources[type] = { ...old!, file: path.basename(kept.target) };
    else delete sources[type];
  }
  if (Object.keys(sources).length) after.sources = sources;
  else delete after.sources;
  if (Object.keys(turns).length) after.halfTurn = turns;
  else delete after.halfTurn;
  for (const [type, on] of Object.entries(draft.halfTurn) as [MediaType, boolean][]) {
    if ((before.halfTurn?.[type] === true) === on) continue;
    infoSteps.push({ kind: 'info', type, text: `Demi-tour ${on ? 'ajouté' : 'retiré'}`, detail: on ? 'le menu tourne ce média d’un demi-tour de plus' : 'le menu tourne ce média d’après ses proportions seulement' });
  }
  if (draft.volume !== undefined && (before.volume ?? 100) !== draft.volume) {
    infoSteps.push({ kind: 'info', text: `Volume de ce jeu : ${before.volume ?? 100} % → ${draft.volume} %`, detail: draft.volume === 100 ? 'comme les autres jeux' : 'vidéos et musique de ce jeu dans le menu, par rapport au réglage général' });
  }
  const ops = [...trash, ...toTemp, ...fromTemp, ...incoming];
  let infoFile: string | undefined;
  if (infoSteps.length || JSON.stringify(after) !== JSON.stringify(before)) {
    infoFile = context.infoFile;
    ops.push({ op: 'write', path: context.infoFile, content: JSON.stringify(setMediaMemory(info, after), null, 2) + '\n' });
    steps.push(...infoSteps);
  }
  return { ops, steps, infoFile, problems };
}

/** Mémoire du .info après le brouillon : demi-tours et volume ; les champs vides disparaissent. */
export function nextMemory(before: MediaMemory, draft: MediaDraft): MediaMemory {
  const next: MediaMemory = { ...before };
  const turns = { ...before.halfTurn };
  for (const [type, on] of Object.entries(draft.halfTurn) as [MediaType, boolean][]) {
    if (on) turns[type] = true;
    else delete turns[type];
  }
  if (Object.keys(turns).length) next.halfTurn = turns;
  else delete next.halfTurn;
  if (draft.volume !== undefined) {
    if (draft.volume === 100) delete next.volume;
    else next.volume = draft.volume;
  }
  return next;
}

/** Nombre de changements du brouillon (un par type modifié, demi-tour ou volume). */
export function draftChangeCount(draft: MediaDraft, current: (type: MediaType) => string[], memory: MediaMemory): number {
  let n = 0;
  for (const type of MANAGED_MEDIA_TYPES) if (isTypeChanged(draft, type, current(type))) n++;
  for (const [type, on] of Object.entries(draft.halfTurn) as [MediaType, boolean][]) if ((memory.halfTurn?.[type] === true) !== on) n++;
  if (draft.volume !== undefined && (memory.volume ?? 100) !== draft.volume) n++;
  return n;
}

// ---------------------------------------------------------------------------
// État d'un type, pour l'écran

/** « Présent », ou le repli utilisé et lequel, en clair. */
export function mediaStateLabel(resolved: ResolvedMedia, root?: string): { label: string; detail: string; present: boolean } {
  const info = mediaTypeInfo(resolved.type);
  const partner = resolved.foundType && resolved.foundType !== resolved.type ? mediaTypeInfo(resolved.foundType) : undefined;
  const name = resolved.file ? path.basename(resolved.file) : '';
  switch (resolved.source) {
    case 'vpx-name':
    case 'folder-name':
    case 'vpinfe':
      if (partner) return { label: `Repli : ${partner.label}`, detail: `${name}, adapté à cet écran`, present: false };
      return {
        label: 'Présent',
        detail: resolved.source === 'vpinfe' ? `${name} (nom de VPinFE)` : resolved.source === 'vpx-name' ? `${name} (nom de ce .vpx)` : name,
        present: true,
      };
    case 'b2s':
      return { label: resolved.type === 'Backglass' ? 'Repli : image du .directb2s' : 'Repli : afficheur du .directb2s', detail: 'Image tirée du fichier du backglass de la table', present: false };
    case 'default':
      return {
        label: `Repli : défaut de la borne${partner ? ` (${partner.label})` : ''}`,
        detail: root ? path.relative(root, resolved.file!) : name,
        present: false,
      };
    case 'fallback':
      return { label: info.fallback === 'none' ? 'Absent' : 'Repli intégré', detail: info.fallbackLabel, present: false };
  }
}
