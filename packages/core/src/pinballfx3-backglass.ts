// Images du fronton de Pinball FX3 (20/11/2026). En mode borne, avec « Repositionnement du fronton »
// activé, FX3 ouvre une fenêtre sur l'écran du fronton et y affiche une image prise dans le dossier des
// tables : relevé sur un PinCab, sans image il y écrit le chemin cherché,
// « …\Pinball FX Classic\data\steam\PinballFX3.[bmp, gif, png, jpg, jpeg] » (écran d'accueil). Pour une
// table, l'image porte le nom de son fichier .pxp (dossier d'un joueur : Alien_Isolation.png à côté de
// Alien_Isolation.pxp, Aliens.jpg à côté de Aliens.pxp ; guide de Blahcade, digitalpinballfans.com).
// FAQ du mode borne de Zen (pinballfx.com/?page_id=7754, section Pinball FX3) : formats .bmp .gif .png
// .jpg .jpeg, dans data\steam, « Citadel.jpg » pour Sorcerer's Lair, « PinballFX3.jpg » pour les menus.
// Pinball FX (2023) suit une autre règle (PinballFX\Mods\Cabinet, PFX.png, Table_<numéro>.png) : pas ici.
//
// Catalogue prêt à l'emploi : « FX3 Backglass art », archive.org (item FX3_202201), 119 images PNG
// nommées comme les .pxp, dont pinballfx3.png pour l'accueil. Créations de joueurs, sans licence
// indiquée : Cyber Pinball ne les distribue pas, il les télécharge sur la borne à la demande du joueur,
// en citant la source. Il ne remplace jamais une image déjà là (celle du joueur, d'un autre pack).
// Relevé le 20/11/2026 sur les 100 tables d'un PinCab : 96 ont leur image sous le même nom, 2 sous un
// autre (PINBALLFX3_BACKGLASS_ALIASES), 2 n'en ont pas (Looter, WMS_Indiana_Jones).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PINBALLFX3_TABLES } from './pinballfx3';

/** Item d'archive.org du catalogue. */
export const PINBALLFX3_BACKGLASS_ITEM = 'FX3_202201';
/** Page du catalogue, citée au joueur. */
export const PINBALLFX3_BACKGLASS_PAGE = `https://archive.org/details/${PINBALLFX3_BACKGLASS_ITEM}`;
/** Liste des fichiers du catalogue (API publique d'archive.org : nom, taille, MD5). */
export const PINBALLFX3_BACKGLASS_METADATA = `https://archive.org/metadata/${PINBALLFX3_BACKGLASS_ITEM}`;
/** Nom du catalogue, tel qu'archive.org le titre. */
export const PINBALLFX3_BACKGLASS_TITLE = 'FX3 Backglass art';

/** Extensions que FX3 cherche, dans son ordre (texte affiché par le jeu). */
export const PINBALLFX3_IMAGE_EXTENSIONS = ['.bmp', '.gif', '.png', '.jpg', '.jpeg'] as const;
/** Image de l'écran d'accueil (hors table). */
export const PINBALLFX3_HOME_IMAGE = 'PinballFX3';

/** Tables dont l'image du catalogue porte un autre nom que le .pxp (nom du .pxp → nom dans le catalogue). */
export const PINBALLFX3_BACKGLASS_ALIASES: Readonly<Record<string, string>> = {
  STARWARS_Episode7: 'STARWARS_Episode_7',
  WMS_Junkyard: 'JunkYard',
};

/** Image du catalogue : chemin dans l'item, taille et MD5 annoncés par archive.org. */
export interface BackglassFile {
  name: string;
  size?: number;
  md5?: string;
}

/** Images du catalogue d'après la réponse de l'API de métadonnées d'archive.org (hors vignette de l'item). */
export function parseBackglassMetadata(json: unknown): BackglassFile[] {
  const files = (json as { files?: unknown })?.files;
  if (!Array.isArray(files)) return [];
  const out: BackglassFile[] = [];
  for (const f of files as { name?: unknown; size?: unknown; md5?: unknown }[]) {
    if (typeof f?.name !== 'string') continue;
    const ext = path.extname(f.name).toLowerCase();
    if (!(PINBALLFX3_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) continue;
    if (path.posix.basename(f.name).startsWith('__ia_')) continue;
    const size = Number(f.size);
    out.push({ name: f.name, ...(Number.isFinite(size) && size > 0 ? { size } : {}), ...(typeof f.md5 === 'string' && /^[0-9a-f]{32}$/i.test(f.md5) ? { md5: f.md5.toLowerCase() } : {}) });
  }
  return out;
}

/** Adresse de téléchargement d'un fichier du catalogue. */
export function backglassDownloadUrl(file: Pick<BackglassFile, 'name'>): string {
  return `https://archive.org/download/${PINBALLFX3_BACKGLASS_ITEM}/${file.name.split('/').map(encodeURIComponent).join('/')}`;
}

/** Nom sans extension, en minuscules : la clé de rapprochement (Windows ne distingue pas la casse). */
function key(name: string): string {
  return path.posix.basename(name.replace(/\\/g, '/')).replace(/\.[^.]+$/, '').toLowerCase();
}

/**
 * Nom FX3 sous lequel chercher une table de Zen dans le catalogue : son .pxp pour FX3 ; pour Pinball FX,
 * celui de la table FX3 du même jeu VPS (même table, autre version du jeu). undefined : aucune.
 */
export function zenCatalogName(fx: { game: 'pinballfx' | 'pinballfx3'; key: string; vps?: string }): string | undefined {
  if (fx.game === 'pinballfx3') return fx.key;
  return fx.vps ? PINBALLFX3_TABLES.find((t) => t.vps === fx.vps)?.name : undefined;
}

/** Image du catalogue pour la table FX3 `name` (nom du .pxp, alias compris) ; undefined si le catalogue n'en a pas. */
export function pinballFx3CatalogImage(catalog: readonly BackglassFile[], name: string): BackglassFile | undefined {
  const want = key(PINBALLFX3_BACKGLASS_ALIASES[name] ?? name);
  return catalog.find((f) => key(f.name) === want);
}

/** Image déjà dans le dossier des tables pour `name` (table ou accueil), quelle qu'en soit l'extension ; undefined sinon. */
export function pinballFx3BackglassImage(tablesDir: string, name: string, files?: readonly string[]): string | undefined {
  let list = files;
  if (!list) {
    try {
      list = fs.readdirSync(tablesDir);
    } catch {
      return undefined;
    }
  }
  const want = name.toLowerCase();
  const found = list.find((f) => (PINBALLFX3_IMAGE_EXTENSIONS as readonly string[]).includes(path.extname(f).toLowerCase()) && f.slice(0, -path.extname(f).length).toLowerCase() === want);
  return found ? path.join(tablesDir, found) : undefined;
}

/** Une image à déposer : pour quelle table (ou l'accueil), d'où, où. */
export interface BackglassStep {
  /** Nom du .pxp, ou PINBALLFX3_HOME_IMAGE. */
  target: string;
  file: BackglassFile;
  url: string;
  /** Fichier à créer dans le dossier des tables. */
  dest: string;
}

export interface BackglassPlan {
  /** À télécharger : la table (ou l'accueil) n'a pas d'image et le catalogue en a une. */
  steps: BackglassStep[];
  /** Déjà une image : rien n'y est touché. */
  present: string[];
  /** Ni image, ni image dans le catalogue. */
  missing: string[];
}

/**
 * Ce que le catalogue `pack` apporte aux tables `tables` (noms des .pxp) du dossier `tablesDir`, plus
 * l'image de l'accueil. Une table qui a déjà une image, de n'importe quelle extension, n'est pas
 * touchée. Le fichier déposé garde l'extension de l'image du catalogue.
 */
export function pinballFx3BackglassPlan(tablesDir: string, tables: readonly string[], pack: readonly BackglassFile[], files?: readonly string[]): BackglassPlan {
  const byKey = new Map<string, BackglassFile>();
  for (const f of pack) if (!byKey.has(key(f.name))) byKey.set(key(f.name), f);
  let list = files;
  if (!list) {
    try {
      list = fs.readdirSync(tablesDir);
    } catch {
      list = [];
    }
  }
  const plan: BackglassPlan = { steps: [], present: [], missing: [] };
  for (const target of [PINBALLFX3_HOME_IMAGE, ...tables]) {
    if (pinballFx3BackglassImage(tablesDir, target, list)) {
      plan.present.push(target);
      continue;
    }
    const file = byKey.get(key(PINBALLFX3_BACKGLASS_ALIASES[target] ?? target));
    if (!file) {
      plan.missing.push(target);
      continue;
    }
    plan.steps.push({ target, file, url: backglassDownloadUrl(file), dest: path.join(tablesDir, target + path.extname(file.name).toLowerCase()) });
  }
  return plan;
}
