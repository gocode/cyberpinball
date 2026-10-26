// « Sons de la table » (fiche > Médias du jeu > Musique ou Son de lancement) : parcourir
// les sons que la table a déjà, dossier par dossier (PuP-Pack, médias du menu…), les
// écouter, et en faire sa musique ou son son de lancement. Une vidéo qui a du son compte
// aussi : seule sa piste son est gardée, extraite sans réencodage dans un .m4a
// (packages/core/src/mp4audio.ts), mis en cache dans <données>\cache\sons.
//
// Le son de la carte choisie se joue (library.js, aperçu sonore), un seul à la fois. Le
// choix va dans le brouillon du gestionnaire : le fichier est copié dans medias\ à
// l'enregistrement, l'original reste à sa place (le pack en a toujours besoin).

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { durationLabel, extractMp4Sound, formatSize, mediaTypeInfo, mediaUrl, t, tableSounds, tn, type MediaType, type TableEntry, type TableSound, type TableSoundFolder } from '@cyberpinball/core';
import type { Action, Built, Row, Tone } from './library';
import type { MediaCard } from './library-medias';
import { allowPreview } from './media-protocol';

export interface TableSoundsContext {
  dataDir: string;
  tablesDir(): string;
  show(build: () => Built, at?: number): void;
  /** Met le fichier dans le brouillon pour ce type ; retourne le message à afficher. */
  place(table: TableEntry, type: MediaType, file: string): string;
  /** Retour à l'écran du média, le curseur sur l'action `at`, avec un message. */
  back(type: MediaType, at: number, message?: { text: string; tone: Tone }): void;
}

interface State {
  table: TableEntry;
  type: MediaType;
  /** Position de « Sons de la table » sur l'écran du média, pour y revenir. */
  at: number;
  folders: TableSoundFolder[];
  notice?: { text: string; tone: Tone };
}

/** Dossier d'une vidéo dont le son a été extrait : un par fichier source (chemin, taille, date). */
function extractDir(dataDir: string, file: string): string {
  const st = fs.statSync(file);
  const key = crypto.createHash('md5').update(`${path.resolve(file).toLowerCase()}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
  return path.join(dataDir, 'cache', 'sons', key);
}

const REFUSALS = {
  get 'not-mp4'() {
    return t('ce n’est pas une vidéo MP4 lisible');
  },
  get 'no-sound'() {
    return t('la vidéo n’a pas de piste son');
  },
  get unplayable() {
    return t('son dans un format que le menu ne lit pas');
  },
  get fragmented() {
    return t('vidéo découpée en fragments, non prise en charge');
  },
  get broken() {
    return t('vidéo abîmée');
  },
};

function folderLabel(f: TableSoundFolder): string {
  if (f.medias) return t('Médias du menu (medias)');
  if (!f.rel) return t('Dossier de la table');
  const parts = f.rel.split(path.sep);
  // Un dossier de PuP-Pack se nomme d'après son pack : « PuP-Pack gotg_2020 › Topper ».
  if (parts[0]?.toLowerCase() === 'pupvideos' && parts[1]) return [t('PuP-Pack {pack}', { pack: parts[1] }), ...parts.slice(2)].join(' › ');
  return parts.join(' › ');
}

function countLabel(f: TableSoundFolder): string {
  const audio = f.files.filter((s) => s.kind === 'audio').length;
  const video = f.files.length - audio;
  const parts = [];
  if (audio) parts.push(tn(audio, '{n} son', '{n} sons'));
  if (video) parts.push(tn(video, '{n} vidéo avec du son', '{n} vidéos avec du son'));
  return parts.join(' · ');
}

function factsOf(s: TableSound): string {
  const size = formatSize(s.bytes);
  if (s.kind === 'audio') return t('son · {size}', { size });
  return t('vidéo : son seulement · {duration} · {size}', { duration: durationLabel(Math.max(1, Math.round(s.seconds ?? 0))), size });
}

export function createTableSounds(ctx: TableSoundsContext) {
  let state: State | undefined;

  /** Ouvre les sons de la table ; un seul dossier : ses fichiers directement. */
  function open(table: TableEntry, type: MediaType, at: number): void {
    const folders = tableSounds(table, { tablesDir: ctx.tablesDir() });
    state = { table, type, at, folders };
    const s = state;
    if (folders.length === 1) go(s, () => buildFiles(s, 0));
    else go(s, () => buildFolders(s));
  }

  function leave(s: State, message?: { text: string; tone: Tone }): void {
    state = undefined;
    ctx.back(s.type, s.at, message);
  }

  /** Change d'écran ; le message ne vaut que pour l'écran qui s'ouvre. */
  function go(s: State, build: () => Built, at?: number, notice?: { text: string; tone: Tone }): void {
    s.notice = notice;
    ctx.show(build, at);
  }

  function noticeRows(s: State): Row[] {
    return s.notice ? [{ text: s.notice.text, tone: s.notice.tone }] : [];
  }

  function buildFolders(s: State): Built {
    const info = mediaTypeInfo(s.type);
    const back = () => leave(s);
    const actions: Action[] = s.folders.map((f, i) => ({ label: folderLabel(f), detail: countLabel(f), run: () => go(s, () => buildFiles(s, i)) }));
    actions.push({ label: t('Retour'), run: back });
    const rows = noticeRows(s);
    if (!s.folders.length) {
      rows.push({
        text: t('Aucun son dans le dossier de la table'),
        detail: t('Ni fichier son, ni vidéo avec du son (PuP-Pack, médias du menu). Les vidéos de VPinMediaDB n’en ont pas.'),
        tone: 'quiet',
      });
    }
    return {
      heading: t('{label} : sons de la table', { label: info.label }),
      subheading: s.table.title,
      lead: t('Les sons que la table a déjà, et les vidéos qui ont du son, rangés par dossier. Choisissez un dossier, puis écoutez : le son de la carte choisie se joue.'),
      sections: rows.length ? [{ rows }] : [],
      actions,
      back,
    };
  }

  function buildFiles(s: State, index: number): Built {
    const info = mediaTypeInfo(s.type);
    const folder = s.folders[index]!;
    const single = s.folders.length === 1;
    const back = () => (single ? leave(s) : go(s, () => buildFolders(s), index));
    const cards: MediaCard[] = [];
    const actions: Action[] = folder.files.map((sound, i) => {
      allowPreview(sound.file);
      cards.push({
        action: i,
        title: path.basename(sound.file),
        facts: factsOf(sound),
        thumb: { kind: 'audio', url: mediaUrl(sound.file), rotation: 0, text: '♪' },
      });
      return { label: path.basename(sound.file), detail: factsOf(sound), run: () => choose(s, index, i, sound) };
    });
    actions.push({ label: single ? t('Retour') : t('Autres dossiers'), run: back });
    const rows = noticeRows(s);
    return {
      heading: t('{label} : {folder}', { label: info.label, folder: folderLabel(folder) }),
      subheading: s.table.title,
      lead: t('Le son de la carte choisie se joue. Start le prend : copié dans medias\\ à l’enregistrement, l’original reste à sa place. D’une vidéo, seul le son est gardé.'),
      sections: rows.length ? [{ rows }] : [],
      actions,
      back,
      media: { cards },
    };
  }

  function choose(s: State, folder: number, at: number, sound: TableSound): void {
    let file = sound.file;
    if (sound.kind === 'video') {
      const dest = path.join(extractDir(ctx.dataDir, sound.file), `${path.basename(sound.file, path.extname(sound.file))}.m4a`);
      if (!fs.existsSync(dest)) {
        const r = extractMp4Sound(sound.file, dest);
        if (!r.ok) {
          go(s, () => buildFiles(s, folder), at, { text: t('Le son de « {file} » n’a pas pu être extrait : {reason}.', { file: path.basename(sound.file), reason: REFUSALS[r.reason] }), tone: 'error' });
          return;
        }
      }
      file = dest;
    }
    leave(s, { text: ctx.place(s.table, s.type, file), tone: 'info' });
  }

  return { open };
}
