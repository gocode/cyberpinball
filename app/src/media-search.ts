// Recherche des médias d'un jeu, partagée par « Chercher les médias » (plan automatique,
// media-download.ts) et par les propositions de chaque média (library-medias.ts) :
// index de VPinMediaDB en cache, indices que la table donne d'elle-même (nom écrit
// dans le .vpx, ROM, PuP-Pack, dossier du DMD, .directb2s), recherche approfondie
// dans la base VPS, aperçus reçus et vérifiés. Cœur : packages/core/src/mediasearch.ts,
// mediachoices.ts et mediadb.ts.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  deepSearchGames,
  inventory,
  loadCabinet,
  loadMediaDb,
  loadMenuMediaSettings,
  mediaDbLeads,
  mediaDbQuality,
  mediaDbSizes,
  mediaDbStagingDir,
  readVpxScreenshot,
  readVpxImages,
  readVpxTableInfo,
  b2sCacheDir,
  refreshMediaDb,
  samePath,
  stageMediaDbFile,
  type GameLead,
  type Layout,
  type MediaDb,
  type MediaDbCandidate,
  type MediaDbFile,
  type MediaDbQualityChoice,
  type MediaDbRefresh,
  type TableEntry,
  type TableEvidence,
  type VpsDb,
  type VpxTableInfo,
  type VpxImage,
  type MediaType,
} from '@cyberpinball/core';
import type { LibraryHost } from './library';
import { cachedScript, readScript } from './vbs';

export interface MediaSearchContext {
  host: LibraryHost;
  layout(): Layout | undefined;
  tablesDir(): string;
  /** Change le message de l'opération en cours. */
  progress(message: string): void;
  /** Base VPS (cache, sinon premier téléchargement). */
  vps(): Promise<VpsDb | undefined>;
}

/** Résultat d'une recherche approfondie pour une table. */
export interface DeepResult {
  vps?: VpsDb;
  /** Jeux possibles, avec ou sans médias sur VPinMediaDB, le plus probable d'abord. */
  leads: GameLead[];
  /** Ceux qui ont des médias sur VPinMediaDB, dans le même ordre. */
  candidates: (MediaDbCandidate & { lead: GameLead })[];
}

export function createMediaSearch(ctx: MediaSearchContext) {
  const { host } = ctx;
  let db: MediaDb | undefined;
  let loaded = false;
  let refreshing: Promise<MediaDbRefresh> | undefined;
  /** Informations écrites dans les .vpx, gardées tant que le fichier ne change pas. */
  const vpxInfos = new Map<string, { size: number; mtimeMs: number; info: VpxTableInfo | undefined }>();

  const downloads = () => ctx.layout()!.downloads;
  const staging = () => mediaDbStagingDir(downloads());

  function refresh(): Promise<MediaDbRefresh> {
    refreshing ??= refreshMediaDb(downloads())
      .then((r) => {
        if (r.status === 'updated') loaded = false;
        return r;
      })
      .finally(() => (refreshing = undefined));
    return refreshing;
  }

  /** L'index en cache tout de suite (mis à jour en arrière-plan, au plus toutes les 12 h), sinon le premier téléchargement. */
  async function index(): Promise<{ db?: MediaDb; problem?: string }> {
    const load = () => {
      if (!loaded) {
        db = loadMediaDb(downloads());
        loaded = true;
      }
      return db;
    };
    if (load()) {
      void refresh();
      return { db };
    }
    ctx.progress('Téléchargement de l’index de VPinMediaDB (environ 2 Mo, une seule fois)…');
    const r = await refresh();
    loaded = false;
    return load() ? { db } : { problem: r.message };
  }

  function vpxInfo(file: string): VpxTableInfo | undefined {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      return undefined;
    }
    const known = vpxInfos.get(file.toLowerCase());
    if (known && known.size === stat.size && known.mtimeMs === stat.mtimeMs) return known.info;
    const info = readVpxTableInfo(file);
    vpxInfos.set(file.toLowerCase(), { size: stat.size, mtimeMs: stat.mtimeMs, info });
    return info;
  }

  /**
   * Ce que la table dit d'elle-même : nom écrit dans le .vpx, script (ROM, PuP-Pack,
   * dossier du DMD), .directb2s, PuP-Packs. Un script jamais lu l'est ici si `read`
   * (VPX l'extrait d'une copie, en une seconde environ ; le résultat est gardé).
   */
  async function evidence(table: TableEntry, read = true): Promise<TableEvidence> {
    const own = !samePath(table.folder, ctx.tablesDir());
    const inv = inventory(table.file, own);
    let script = cachedScript(table.file, host.dataDir);
    const exe = host.vpxExe();
    if (!script && read && exe) {
      ctx.progress('Lecture du script de la table…');
      const r = await readScript(exe, table.file, host.dataDir);
      if (!('error' in r)) script = r;
    }
    return { vpxInfo: vpxInfo(table.file), script, backglass: inv.backglass, pupDirs: inv.pup };
  }

  /**
   * Jeux possibles pour la table, et ceux qui ont des médias ; `query` : texte saisi
   * par l'utilisateur ; `readScripts` : lire le script s'il ne l'a jamais été.
   */
  async function deep(table: TableEntry, found: MediaDb | undefined, query?: string, readScripts = true): Promise<DeepResult> {
    const vps = await ctx.vps();
    if (!vps) {
      // Sans base VPS, seul l'identifiant du .info mène à VPinMediaDB.
      const id = table.info.Info?.VPSId?.trim();
      const entry = id ? found?.entries.get(id) : undefined;
      return { leads: [], candidates: entry ? [{ entry, lead: { game: { id: entry.id, name: table.title }, score: 1, reasons: ['identifiant VPS du .info'] } }] : [] };
    }
    const leads = deepSearchGames(vps, table, await evidence(table, readScripts), { vpsId: table.info.Info?.VPSId?.trim() || undefined, query });
    return { vps, leads, candidates: found ? mediaDbLeads(found, leads) : [] };
  }

  /**
   * Capture rangée dans le .vpx par son auteur, écrite une fois dans le cache des
   * médias (<données>\cache\medias) ; undefined si la table n'en a pas.
   */
  function screenshot(table: TableEntry): string | undefined {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(table.file);
    } catch {
      return undefined;
    }
    const dir = b2sCacheDir(host.dataDir);
    const key = crypto.createHash('md5').update(`${table.file.toLowerCase()}|${stat.size}|${stat.mtimeMs}`).digest('hex').slice(0, 16);
    const known = ['png', 'jpg', 'gif', 'webp'].map((ext) => path.join(dir, `vpx-${key}.${ext}`)).find((f) => fs.existsSync(f));
    if (known) return known;
    const none = path.join(dir, `vpx-${key}.none`);
    if (fs.existsSync(none)) return undefined;
    const shot = readVpxScreenshot(table.file);
    fs.mkdirSync(dir, { recursive: true });
    if (!shot) {
      // Pas de capture : on s'en souvient, pour ne pas relire la table à chaque visite.
      fs.writeFileSync(none, '');
      return undefined;
    }
    const file = path.join(dir, `vpx-${key}.${shot.ext}`);
    fs.writeFileSync(file, shot.data);
    return file;
  }

  /**
   * Images rangées dans le .vpx qui peuvent servir de médias (readVpxImages) : plateau à
   * plat, carte de règles, fronton et logo de la pièce VR. Écrites une fois dans le
   * cache des médias, avec un sommaire (vpx-<clé>-images.json) pour ne pas relire la table.
   */
  function vpxImages(table: TableEntry): { type: MediaType; file: string; label: string }[] {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(table.file);
    } catch {
      return [];
    }
    const dir = b2sCacheDir(host.dataDir);
    const key = crypto.createHash('md5').update(`${table.file.toLowerCase()}|${stat.size}|${stat.mtimeMs}`).digest('hex').slice(0, 16);
    const summary = path.join(dir, `vpx-${key}-images.json`);
    try {
      const known = JSON.parse(fs.readFileSync(summary, 'utf8')) as { type: MediaType; file: string; label: string }[];
      if (known.every((k) => fs.existsSync(k.file))) return known;
    } catch {
      // Jamais lu, ou fichiers effacés : on relit la table.
    }
    const images = readVpxImages(table.file, vpxInfo(table.file)?.rules);
    if (!images) return [];
    fs.mkdirSync(dir, { recursive: true });
    const out: { type: MediaType; file: string; label: string }[] = [];
    const write = (type: MediaType, img: VpxImage, n: number, label: string) => {
      const file = path.join(dir, `vpx-${key}-${type.toLowerCase()}${n}.${img.ext}`);
      fs.writeFileSync(file, img.data);
      out.push({ type, file, label: `${label} « ${img.name} », ${img.width} × ${img.height}` });
    };
    if (images.playfield) write('Playfield', images.playfield, 0, 'Plateau à plat, rangé dans la table :');
    if (images.rules) write('GameHelp', images.rules, 0, 'Carte de règles rangée dans la table :');
    images.backglass.forEach((img, i) => write('Backglass', img, i, 'Fronton de la pièce VR de la table :'));
    images.logos.forEach((img, i) => write('Wheel', img, i, 'Logo de la pièce VR de la table :'));
    fs.writeFileSync(summary, JSON.stringify(out, null, 2) + '\n');
    return out;
  }

  function quality(): MediaDbQualityChoice {
    return mediaDbQuality(loadMenuMediaSettings(host.dataDir).downloadQuality, loadCabinet(host.dataDir));
  }

  /** Aperçus reçus et vérifiés dans downloads\vpinmediadb ; ceux qui manquent (réseau) sont absents. */
  async function stagePreviews(files: MediaDbFile[], into: Map<string, string>, label = 'Aperçus'): Promise<void> {
    const wanted = [...new Map(files.map((f) => [f.url, f])).values()]
      // Un aperçu déjà reçu peut avoir été rangé dans medias\ entre-temps (même fichier que le téléchargement) : on le reprend.
      .filter((f) => !into.has(f.url) || !fs.existsSync(into.get(f.url)!));
    let n = 0;
    for (const file of wanted) {
      ctx.progress(`${label} : ${++n} sur ${wanted.length}…`);
      try {
        into.set(file.url, (await stageMediaDbFile(staging(), file)).path);
      } catch {
        // Aperçu indisponible (réseau) : la carte le dit.
      }
    }
  }

  async function sizes(files: MediaDbFile[]): Promise<Map<string, number>> {
    return mediaDbSizes(files, { downloadsDir: downloads(), onProgress: (done, total) => ctx.progress(`Poids des fichiers : ${done} sur ${total}…`) });
  }

  /** Télécharge un fichier dans le dossier de réception, vérifié par MD5 ; renvoie son chemin. */
  async function stage(file: MediaDbFile, onData?: (received: number, total: number | undefined) => void): Promise<string> {
    return (await stageMediaDbFile(staging(), file, { onData })).path;
  }

  return { index, vps: () => ctx.vps(), evidence, deep, screenshot, vpxImages, quality, stagePreviews, sizes, stage, staging, downloads };
}

export type MediaSearch = ReturnType<typeof createMediaSearch>;
