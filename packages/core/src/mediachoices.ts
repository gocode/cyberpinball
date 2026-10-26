// Choix possibles pour chaque média d'un jeu, au-delà du choix automatique : toutes
// les variantes que VPinMediaDB a pour chaque jeu retenu par la recherche (autres
// éditions comprises), et ce que la borne a déjà sans le savoir :
//
// - le PuP-Pack de la table (pupvideos\<pack>) : vidéos de fronton, de topper et du
//   DMD, musiques. Les dossiers n'ont pas de rôle déclaré fiable (playlists.pup met
//   souvent tout sur l'écran 0) : on se fie à leur nom, l'utilisateur juge sur l'aperçu ;
// - le dossier FlexDMD ou UltraDMD du script : animations de l'afficheur ;
// - les images de chaque .directb2s du dossier (fronton allumé, afficheur, et les mêmes
//   « tout allumés », ampoules posées dessus), un fichier en double n'étant montré qu'une fois ;
// - la capture de la table que son auteur a rangée dans le .vpx.
//
// S'y ajoutent les vignettes de la base VPS (une par version de la table et par
// .directb2s) : basse définition, mais souvent la seule image d'un jeu absent de
// VPinMediaDB.
//
// Ces fichiers appartiennent déjà à l'utilisateur : les prendre ne pose pas de
// question de droits. Ils sont copiés dans medias\, jamais déplacés : la table en a
// toujours besoin.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { B2sElement, B2sImages, B2sLitImages } from './b2simage';
import { t, tn } from './i18n';
import { mediaDbOfferLabel, mediaDbOffers, type MediaDbCandidate, type MediaDbOffer, type MediaDbQuality } from './mediadb';
import { isAcceptedFormat, mediaKind, MEDIA_TYPES, type MediaKind, type MediaType } from './medias';
import { isJunkName, parseCsvLine, parseScreens, screenRole } from './puppack';
import type { SiteHit } from './mediasites';
import type { TableEntry } from './tables';
import { vpsLabel, type VpsGame } from './vps';

export type MediaChoiceSource = 'mediadb' | 'vps' | 'vps-music' | 'pup' | 'dmd-folder' | 'b2s' | 'vpx' | 'vpforums' | 'vpuniverse' | 'web';

export const MEDIA_CHOICE_SOURCE_LABELS: Record<MediaChoiceSource, string> = {
  mediadb: 'VPinMediaDB',
  get vps() {
    return t('Vignette VPS');
  },
  get 'vps-music'() {
    return t('Musique (base VPS, Dropbox)');
  },
  get pup() {
    return t('PuP-Pack de la table');
  },
  get 'dmd-folder'() {
    return t('Dossier du DMD de la table');
  },
  get b2s() {
    return t('Fichier .directb2s de la table');
  },
  get vpx() {
    return t('Image rangée dans la table');
  },
  vpforums: 'VPForums',
  vpuniverse: 'VPUniverse',
  get web() {
    return t('Téléchargé du web');
  },
};

/** Empreinte MD5 d'un fichier, lu par morceaux (une vidéo 4k pèse des centaines de Mo). */
function fileMd5(file: string): string {
  const hash = crypto.createHash('md5');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 20);
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) hash.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/**
 * Même contenu, octet pour octet (taille, puis MD5) : prendre l'un à la place de
 * l'autre ne change rien à ce que le menu montre. Un fichier illisible n'est pas le même.
 */
export function sameFileContent(a: string, b: string): boolean {
  try {
    if (fs.statSync(a).size !== fs.statSync(b).size) return false;
    return fileMd5(a) === fileMd5(b);
  } catch {
    return false;
  }
}

/**
 * Musiques pour la table que la base VPS donne (soundFiles), sur Dropbox seulement :
 * un lien de partage public vers un mp3, téléchargé à la demande de l'utilisateur
 * (« dl=1 » demande le fichier plutôt que la page de Dropbox). Un lien mort renvoie une
 * page HTML : le contenu reçu est vérifié (isAudioFile) avant d'être proposé.
 */
export function vpsMusicChoices(games: VpsGame[]): MediaChoices {
  const out: MediaChoice[] = [];
  for (const game of games) {
    for (const f of game.soundFiles ?? []) {
      for (const link of f.urls ?? []) {
        let url: URL;
        try {
          url = new URL(link.url);
        } catch {
          continue;
        }
        if (link.broken || !/(^|\.)dropbox\.com$/i.test(url.hostname) || !/\.(mp3|ogg)$/i.test(url.pathname)) continue;
        url.searchParams.set('dl', '1');
        const file = { url: url.toString() };
        const ext = path.posix.extname(url.pathname).slice(1).toLowerCase();
        const by = [f.authors?.slice(0, 2).join(', '), f.version].filter(Boolean).join(' ');
        out.push({
          id: `vps-music:${game.id}:${f.id}`,
          type: 'Audio',
          kind: 'audio',
          source: 'vps-music',
          label: vpsLabel(game),
          detail: by ? t('musique pour la table de {by}', { by }) : t('musique pour la table'),
          offer: { type: 'Audio', key: `vps/sound/${f.id}`, file, kind: 'audio', ext },
          vpsId: game.id,
        });
        break;
      }
    }
  }
  return out.length ? { Audio: out } : {};
}

/** Signatures des sons que le menu lit : un fichier reçu qui n'en a aucune n'est pas un son (page d'erreur). */
export function isAudioFile(file: string): boolean {
  let head: Buffer;
  try {
    const fd = fs.openSync(file, 'r');
    head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
  } catch {
    return false;
  }
  const ascii = head.toString('latin1');
  return ascii.startsWith('ID3') || ascii.startsWith('OggS') || ascii.startsWith('fLaC') || (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') || ascii.slice(4, 8) === 'ftyp' || (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0);
}

/** Origine notée dans le .info pour une vignette de la base VPS. */
export const VPS_IMAGE_ORIGIN = 'Base VPS';
/** Seules adresses acceptées pour une vignette : celles du site de la base VPS. */
const VPS_IMAGE_PREFIX = 'https://virtualpinballspreadsheet.github.io/vps-db/img/';

/** Un média possible pour un type. */
export interface MediaChoice {
  /** Identifiant stable : « mediadb:<idVPS>:<clé> », ou le chemin du fichier local. */
  id: string;
  type: MediaType;
  kind: MediaKind;
  source: MediaChoiceSource;
  /** « Guardians of the Galaxy (Pro) (Stern 2017) », « gotg_2020 \ BGDefault \ default.mp4 » */
  label: string;
  /** « vidéo 1k », « image 4k », « son » */
  detail: string;
  /** En ligne (VPinMediaDB, vignette VPS) : le fichier à télécharger, et son aperçu. */
  offer?: MediaDbOffer;
  /** Jeu VPS d'où vient un fichier en ligne. */
  vpsId?: string;
  candidate?: MediaDbCandidate;
  /** Sur la borne : le fichier, à copier dans medias\. */
  file?: string;
  /** Poids sur le disque (fichier local). */
  bytes?: number;
  /**
   * Site communautaire (mediasites.ts) : la fiche du site ; `received` quand le fichier
   * est déjà arrivé (`file` le désigne alors), sinon il reste à télécharger.
   */
  site?: { hit: SiteHit; pack: boolean; received?: boolean };
}

export type MediaChoices = Partial<Record<MediaType, MediaChoice[]>>;

/**
 * Toutes les variantes de VPinMediaDB pour les jeux retenus, type par type, dans
 * l'ordre des jeux (le plus probable d'abord) puis des variantes (vidéo avant
 * image). Un même fichier (même MD5) partagé par deux éditions n'apparaît qu'une fois.
 */
export function mediaDbChoices(candidates: MediaDbCandidate[], quality: MediaDbQuality): MediaChoices {
  const out: MediaChoices = {};
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const game = candidate.game ? vpsLabel(candidate.game) : candidate.entry.id;
    for (const { type, variants } of mediaDbOffers(candidate.entry, quality)) {
      for (const offer of variants) {
        const key = offer.file.md5 ?? offer.file.url;
        if (seen.has(key)) continue;
        seen.add(key);
        (out[type] ??= []).push({
          id: `mediadb:${candidate.entry.id}:${offer.key}`,
          type,
          kind: offer.kind,
          source: 'mediadb',
          label: game,
          detail: mediaDbOfferLabel(offer),
          offer,
          vpsId: candidate.entry.id,
          candidate,
        });
      }
    }
  }
  return out;
}

/** Vignettes par jeu et par type, au plus : les plus récentes d'abord, souvent les plus grandes. */
const MAX_VPS_IMAGES = 6;

/**
 * Vignettes de la base VPS pour ces jeux : le plateau de chaque version de la table,
 * le fronton de chaque .directb2s. Basse définition (de 352 × 626 à 1 000 × 750).
 */
export function vpsImageChoices(games: VpsGame[]): MediaChoices {
  const out: MediaChoices = {};
  const seen = new Set<string>();
  for (const game of games) {
    for (const [type, files] of [
      ['Playfield', game.tableFiles ?? []],
      ['Backglass', game.b2sFiles ?? []],
    ] as const) {
      const usable = files
        .filter((f) => typeof f.imgUrl === 'string' && f.imgUrl.startsWith(VPS_IMAGE_PREFIX) && !f.imgUrl.includes('..') && /\.(webp|png|jpe?g)$/i.test(f.imgUrl))
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, MAX_VPS_IMAGES);
      for (const f of usable) {
        if (seen.has(f.imgUrl!)) continue;
        seen.add(f.imgUrl!);
        const ext = path.posix.extname(new URL(f.imgUrl!).pathname).slice(1).toLowerCase();
        const file = { url: f.imgUrl! };
        const by = [f.authors?.slice(0, 3).join(', '), f.version].filter(Boolean).join(' ');
        (out[type] ??= []).push({
          id: `vps:${game.id}:${f.id}`,
          type,
          kind: 'image',
          source: 'vps',
          label: vpsLabel(game),
          detail:
            type === 'Playfield'
              ? by
                ? t('vignette du plateau de {by}', { by })
                : t('vignette du plateau')
              : by
                ? t('vignette du fronton de {by}', { by })
                : t('vignette du fronton'),
          offer: { type, key: `vps/${type === 'Playfield' ? 'table' : 'b2s'}/${f.id}`, file, kind: 'image', ext, preview: file },
          vpsId: game.id,
        });
      }
    }
  }
  return out;
}

export interface LocalChoiceOptions {
  /** Chaque .directb2s du dossier, celui que VPX charge d'abord. */
  b2s?: B2sSource[];
  /** Dossier FlexDMD ou UltraDMD que charge le script (ScriptFacts.dmdFolder), relatif à la table. */
  dmdFolder?: string;
  /** Capture rangée dans le .vpx (readVpxScreenshot), déjà écrite dans le cache. */
  screenshot?: string;
  /** Images rangées dans le .vpx (readVpxImages), déjà écrites dans le cache : plateau, règles, fronton et logo VR. */
  vpxImages?: { type: MediaType; file: string; label: string }[];
}

/** Un .directb2s de la table et ses images, déjà extraites dans le cache (b2sImages, b2sLitImages). */
export interface B2sSource {
  /** Nom du fichier, dans le dossier de la table. */
  name: string;
  /** Celui que VPX charge (nommé comme la table ou comme le dossier) ; les autres ne servent qu'ici. */
  loaded: boolean;
  images: B2sImages;
  lit?: B2sLitImages;
}

const B2S_ELEMENT_LABELS: Record<B2sElement, string> = {
  get BackglassOnImage() {
    return t('Image allumée du fronton');
  },
  get BackglassImage() {
    return t('Image du fronton');
  },
  get BackglassOffImage() {
    return t('Image éteinte du fronton');
  },
  get DMDImage() {
    return t('Image de l’afficheur');
  },
};

/**
 * Les .directb2s dont l'image extraite diffère : une copie du même fichier sous un autre
 * nom (fréquent : « Terminator 2.directb2s » et le nom du site) n'est montrée qu'une fois,
 * celle que VPX charge d'abord.
 */
function distinctB2s(list: B2sSource[]): B2sSource[] {
  const seen = new Set<string>();
  const out: B2sSource[] = [];
  for (const src of [...list].sort((a, b) => Number(b.loaded) - Number(a.loaded))) {
    const image = src.images.backglass ?? src.images.dmd;
    let key: string | undefined;
    try {
      key = image ? crypto.createHash('md5').update(fs.readFileSync(image.file)).digest('hex') : undefined;
    } catch {
      key = undefined;
    }
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(src);
  }
  return out;
}

/** Au plus, par type et par dossier source : au-delà, l'écran ne se lit plus. */
const MAX_PER_SOURCE = 12;
/** En dessous, une vidéo ou une image de pack n'est qu'un effet (ou un fichier vide « @blank.mp4 »). */
const MIN_SCREEN_BYTES = 20 * 1024;
/** En dessous, un son est un bruitage, pas une musique. */
const MIN_MUSIC_BYTES = 500 * 1024;

/** Types qu'un dossier de PuP-Pack peut fournir, d'après son nom, le plus parlant d'abord. */
function pupFolderTypes(folder: string): { type: MediaType; rank: number }[] {
  const f = folder.toLowerCase();
  const out: { type: MediaType; rank: number }[] = [];
  if (/^bg|backglass|^bgdefault|attract/.test(f) && !/dmd/.test(f)) out.push({ type: 'Backglass', rank: /^bg|backglass/.test(f) ? 0 : 1 });
  if (/topper/.test(f)) out.push({ type: 'Topper', rank: 0 });
  if (/dmd/.test(f)) out.push({ type: 'FullDMD', rank: /attract|default|splash|background/.test(f) ? 0 : 1 }, { type: 'DMD', rank: /attract|default|splash|background/.test(f) ? 0 : 1 });
  if (/loading|intro|startgame|^start/.test(f)) out.push({ type: 'Loading', rank: 1 });
  return out;
}

export const MUSIC_FOLDER = /music|song|audio|bgm|soundtrack|topper|attract/i;
/** Copies de sauvegarde, options et polices d'un pack : rien à montrer. */
export const SPARE_FOLDER = /backup|\.orig$|options|_delta|^fonts?$/i;

interface PupTrigger {
  trigger: string;
  screen: number;
  playlist: string;
  playFile: string;
  /** Loop = SetBG : fond permanent de l'écran. */
  background: boolean;
}

/**
 * Déclencheurs actifs de triggers.pup (colonnes ID, Active, Descript, Trigger,
 * ScreenNum, PlayList, PlayFile, Volume, Priority, Length, Counter, RestSeconds, Loop,
 * Defaults ; lues d'après l'en-tête). Vide si le fichier manque.
 */
function readTriggers(file: string): PupTrigger[] {
  let lines: string[];
  try {
    lines = fs.readFileSync(file, 'latin1').split(/\r?\n/).filter((l) => l.trim());
  } catch {
    return [];
  }
  const header = parseCsvLine(lines[0] ?? '').map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [active, trigger, screen, playlist, playFile, loop] = ['active', 'trigger', 'screennum', 'playlist', 'playfile', 'loop'].map(col);
  if (trigger! < 0 || screen! < 0 || playlist! < 0) return [];
  return lines.slice(1).flatMap((line) => {
    const p = parseCsvLine(line);
    if (active! >= 0 && p[active!] === '0') return [];
    const num = Number.parseInt(p[screen!] ?? '', 10);
    if (!Number.isFinite(num)) return [];
    return [{ trigger: p[trigger!] ?? '', screen: num, playlist: p[playlist!] ?? '', playFile: playFile! >= 0 ? (p[playFile!] ?? '') : '', background: loop! >= 0 && /setbg/i.test(p[loop!] ?? '') }];
  });
}

function sizeOf(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

/** Fichiers d'un dossier et de ses sous-dossiers, sur deux niveaux, sans les fichiers parasites. */
function listFiles(dir: string, depth = 1): { file: string; bytes: number }[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: { file: string; bytes: number }[] = [];
  for (const d of entries) {
    if (isJunkName(d.name) || d.name.startsWith('.') || /^@?blank/i.test(d.name)) continue;
    const file = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (depth > 0 && !SPARE_FOLDER.test(d.name)) out.push(...listFiles(file, depth - 1));
      continue;
    }
    try {
      out.push({ file, bytes: fs.statSync(file).size });
    } catch {
      // Fichier disparu entre-temps : ignoré.
    }
  }
  return out;
}

/**
 * Médias que la borne a déjà pour cette table, hors de medias\ : PuP-Pack, dossier
 * du DMD, images du .directb2s. Rangés par type, les plus parlants d'abord.
 */
export function localMediaChoices(table: TableEntry, opts: LocalChoiceOptions = {}): MediaChoices {
  const out: MediaChoices = {};
  const seen = new Set<string>();
  const push = (choice: MediaChoice) => {
    const key = `${choice.type}|${choice.id.toLowerCase()}`;
    if (seen.has(key) || !isAcceptedFormat(choice.type, choice.id)) return;
    seen.add(key);
    (out[choice.type] ??= []).push(choice);
  };
  const local = (type: MediaType, file: string, bytes: number, source: MediaChoiceSource, label: string): MediaChoice | undefined => {
    const kind = mediaKind(file);
    if (!kind) return undefined;
    return { id: file, type, kind, source, label, detail: kind === 'video' ? t('vidéo') : kind === 'audio' ? t('son') : t('image'), file, bytes };
  };

  // .directb2s : le fronton allumé et l'afficheur, déjà extraits pour le repli, puis les mêmes
  // avec toutes leurs ampoules allumées ; un second fichier du dossier est un autre fronton.
  const sources = distinctB2s(opts.b2s ?? []);
  for (const src of sources) {
    const from = src.loaded ? (sources.length > 1 ? ` (${src.name})` : '') : t(' ({name}, que VPX ne charge pas)', { name: src.name });
    const { backglass, dmd } = src.images;
    if (backglass) push(local('Backglass', backglass.file, backglass.bytes, 'b2s', `${B2S_ELEMENT_LABELS[backglass.element]}${from}`)!);
    if (src.lit?.backglass) push(local('Backglass', src.lit.backglass.file, src.lit.backglass.bytes, 'b2s', tn(src.lit.backglass.bulbs, 'Fronton tout allumé : {n} lampe posée sur l’image', 'Fronton tout allumé : {n} lampes posées sur l’image') + from)!);
    for (const type of ['FullDMD', 'DMD'] as const) {
      if (dmd) push(local(type, dmd.file, dmd.bytes, 'b2s', t('Image de l’afficheur') + from)!);
      if (src.lit?.dmd) push(local(type, src.lit.dmd.file, src.lit.dmd.bytes, 'b2s', tn(src.lit.dmd.bulbs, 'Afficheur tout allumé : {n} lampe posée sur l’image', 'Afficheur tout allumé : {n} lampes posées sur l’image') + from)!);
    }
  }

  // Capture de la table rangée dans le .vpx par son auteur : souvent le plateau entier.
  if (opts.screenshot && fs.existsSync(opts.screenshot)) push(local('Playfield', opts.screenshot, fs.statSync(opts.screenshot).size, 'vpx', t('Capture de la table, choisie par son auteur'))!);
  // Autres images de la table : plateau à plat, carte de règles, fronton et logo de la pièce VR.
  for (const img of opts.vpxImages ?? []) {
    if (fs.existsSync(img.file)) push(local(img.type, img.file, fs.statSync(img.file).size, 'vpx', img.label)!);
  }

  // PuP-Packs à côté de la table : un dossier par playlist.
  const pupRoot = path.join(table.folder, 'pupvideos');
  let packs: string[] = [];
  try {
    packs = fs.readdirSync(pupRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && !isJunkName(d.name)).map((d) => d.name);
  } catch {
    packs = [];
  }
  for (const pack of packs) {
    const byType = new Map<MediaType, { choice: MediaChoice; rank: number }[]>();
    const add = (type: MediaType, rank: number, choice: MediaChoice | undefined) => {
      if (choice) byType.set(type, [...(byType.get(type) ?? []), { choice, rank }]);
    };
    /** Fichiers dont screens.pup ou triggers.pup disent l'écran : le nom du dossier ne compte plus. */
    const declared = new Map<string, Set<MediaType>>();
    const declare = (file: string, types: MediaType[]) => {
      const key = file.toLowerCase();
      declared.set(key, new Set([...(declared.get(key) ?? []), ...types]));
    };
    let folders: fs.Dirent[] = [];
    try {
      folders = fs.readdirSync(path.join(pupRoot, pack), { withFileTypes: true }).filter((d) => d.isDirectory() && !isJunkName(d.name) && !SPARE_FOLDER.test(d.name));
    } catch {
      folders = [];
    }
    // Image ou vidéo par défaut que screens.pup donne à un écran : le vrai fronton du pack.
    const typesOf = (role: string): MediaType[] => (role === 'backglass' ? ['Backglass'] : role === 'topper' ? ['Topper'] : ['FullDMD', 'DMD']);
    let screens: ReturnType<typeof parseScreens> = [];
    try {
      screens = parseScreens(fs.readFileSync(path.join(pupRoot, pack, 'screens.pup'), 'latin1'));
    } catch {
      // Pas de screens.pup (ou illisible) : les déclencheurs et les dossiers suffisent.
    }
    for (const screen of screens) {
      const role = screenRole(screen.num);
      if (!role || !screen.playlist || !screen.playFile) continue;
      const file = path.join(pupRoot, pack, screen.playlist, screen.playFile);
      if (!fs.existsSync(file)) continue;
      declare(file, typesOf(role));
      for (const type of typesOf(role)) add(type, -1, local(type, file, fs.statSync(file).size, 'pup', t('{pack} : écran {screen}, fichier par défaut du pack', { pack, screen: screen.description || screen.num })));
    }
    // Déclencheurs du pack : le fond posé au démarrage (D0) ou en attente (E454), et la musique
    // des écrans « MusicOnly ». Les fonds posés par les modes de jeu sont des scènes de partie.
    const musicScreens = new Set(screens.filter((s) => /^musiconly$/i.test(s.mode)).map((s) => s.num));
    for (const trig of readTriggers(path.join(pupRoot, pack, 'triggers.pup'))) {
      if (!trig.playlist) continue;
      const dir = path.join(pupRoot, pack, trig.playlist);
      const files = trig.playFile ? [{ file: path.join(dir, trig.playFile), bytes: sizeOf(path.join(dir, trig.playFile)) }] : listFiles(dir, 0);
      if (musicScreens.has(trig.screen)) {
        for (const f of files) if (mediaKind(f.file) === 'audio' && f.bytes >= MIN_MUSIC_BYTES) add('Audio', -1, local('Audio', f.file, f.bytes, 'pup', t('{path} (musique du pack)', { path: `${pack} \\ ${trig.playlist}\\${path.basename(f.file)}` })));
        continue;
      }
      const role = screenRole(trig.screen);
      if (!role || !trig.playFile || !/^(D0|E454)$/i.test(trig.trigger)) continue;
      const [f] = files;
      if (!f) continue;
      declare(f.file, typesOf(role));
      if (f.bytes < MIN_SCREEN_BYTES || /^@|blank/i.test(path.basename(f.file))) continue;
      const when = /^D0$/i.test(trig.trigger) ? t('au démarrage') : t('en attente');
      for (const type of typesOf(role)) add(type, -1, local(type, f.file, f.bytes, 'pup', t('{path} (écran {screen}, {when})', { path: `${pack} \\ ${trig.playlist}\\${trig.playFile}`, screen: trig.screen, when })));
    }
    // Images de cadre à la proportion d'un fronton (« GOTG-4x3.png », « -5x4.png »).
    for (const f of listFiles(path.join(pupRoot, pack, 'PupImages'), 0)) {
      if (/[-_ ](4x3|5x4|16x9)\.(png|jpe?g|webp)$/i.test(f.file)) add('Backglass', 1, local('Backglass', f.file, f.bytes, 'pup', `${pack} \\ PupImages\\${path.basename(f.file)}`));
    }
    for (const folder of folders) {
      const types = pupFolderTypes(folder.name);
      for (const { file, bytes } of listFiles(path.join(pupRoot, pack, folder.name))) {
        const kind = mediaKind(file);
        const label = `${pack} \\ ${path.relative(path.join(pupRoot, pack), file)}`;
        if (kind === 'audio') {
          if (bytes >= MIN_MUSIC_BYTES) add('Audio', MUSIC_FOLDER.test(folder.name) ? 0 : 1, local('Audio', file, bytes, 'pup', label));
          continue;
        }
        if (bytes < MIN_SCREEN_BYTES) continue;
        const known = declared.get(file.toLowerCase());
        for (const { type, rank } of types) if (!known || known.has(type)) add(type, rank, local(type, file, bytes, 'pup', label));
      }
    }
    for (const [type, list] of byType) {
      list.sort((a, b) => a.rank - b.rank || (b.choice.bytes ?? 0) - (a.choice.bytes ?? 0));
      for (const { choice } of list.slice(0, MAX_PER_SOURCE)) push(choice);
    }
  }

  // Dossier FlexDMD ou UltraDMD : animations de l'afficheur.
  if (opts.dmdFolder) {
    const dir = path.join(table.folder, opts.dmdFolder);
    const files = listFiles(dir)
      .filter((f) => f.bytes >= MIN_SCREEN_BYTES && mediaKind(f.file) !== 'audio')
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, MAX_PER_SOURCE);
    for (const { file, bytes } of files) {
      for (const type of ['FullDMD', 'DMD'] as const) push(local(type, file, bytes, 'dmd-folder', `${opts.dmdFolder} \\ ${path.relative(dir, file)}`)!);
    }
  }
  return out;
}

/** Les choix des deux origines réunis, dans l'ordre du catalogue des types. */
export function mergeMediaChoices(...lists: MediaChoices[]): MediaChoices {
  const out: MediaChoices = {};
  for (const { type } of MEDIA_TYPES) {
    const all = lists.flatMap((l) => l[type] ?? []);
    if (all.length) out[type] = all;
  }
  return out;
}
