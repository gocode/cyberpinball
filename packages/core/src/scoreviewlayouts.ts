// Mises en page de ScoreView qui remplissent la fenêtre du DMD. Demande du 12/11/2026 : « il y a
// souvent des bandes noires sur les côtés des DMD, on devrait pouvoir profiter de toute la surface ».
//
// Le plugin ScoreView de VPX 10.8.1 dessine le DMD dans sa fenêtre d'après une mise en page (.scv) :
// il prend, parmi celles qu'il connaît, celle dont les proportions sont les plus proches de la
// fenêtre, et la pose en « Contain » (seule valeur de Fit qu'il accepte : plugins/scoreview/ScoreView.cpp,
// Parse et Render). Ses mises en page d'origine sont au format du DMD (128 × 32 : 4:1) : une fenêtre
// réglée en 4,5:1 ou 3:1 garde des bandes noires. Le réglage « LayoutFolder » ([Plugin.ScoreView])
// lui donne un dossier à lui, qui remplace celles d'origine.
//
// Ce dossier (<données>\scoreview) reprend toutes les mises en page de la version de VPX installée
// (afficheurs alphanumériques, écrans LCD et CRT : à l'identique, avec leurs images de verre), et
// ajoute pour chaque DMD des variantes étirées, de 1,5 % en 1,5 % de proportions : la plus proche de la
// fenêtre la remplit (moins de 1 % de bande). Seulement autour du format du DMD (FILL_SPREAD), et jamais
// plus étroit que MIN_FILL_ASPECT : une fenêtre de tout un écran 16:9 (FullDMD sans cadre) garde un DMD à
// ses proportions, au milieu, comme avant. Une variante « Contain » juste au-delà de chaque bout
// empêche la variante étirée la plus proche d'être prise pour une fenêtre hors de ces bornes.
//
// Le dossier est réécrit quand la version de VPX (ses mises en page) ou ces règles changent ; la clé
// n'est proposée que vide (vpxFolderDefaults) : un dossier choisi par l'utilisateur reste le sien.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';

/** Dossier des mises en page, sous le dossier des données. */
export const SCOREVIEW_LAYOUTS_DIR = 'scoreview';

/** Pas entre deux variantes : 1,5 % de proportions. */
const STEP = 1.015;
/** Étirement accepté : jusqu'à 2,1 fois plus large ou plus haut que le DMD. */
const FILL_SPREAD = 2.1;
/** Jamais plus étroit : un écran 16:9 (1,78) ou 16:10 entier n'est pas une fenêtre taillée pour le DMD. */
export const MIN_FILL_ASPECT = 1.9;
/** Changer ce numéro réécrit le dossier sur toutes les bornes. */
const RULES_VERSION = 1;
const STAMP = 'cyberpinball.json';

export interface ScvFile {
  name: string;
  content: string;
}

/** Proportions (largeur sur hauteur) entre lesquelles une fenêtre est remplie pour un DMD de ce format. */
export function scoreViewFillRange(native: number): { min: number; max: number } {
  return { min: Math.max(MIN_FILL_ASPECT, native / FILL_SPREAD), max: native * FILL_SPREAD };
}

/** Taille d'une mise en page (Width / Height sans retrait), et la sorte de chacun de ses visuels (« - DMD: »). */
function readLayout(text: string): { width: number; height: number; visuals: string[] } | undefined {
  const top = (key: string) => {
    const m = new RegExp(`^${key}:\\s*([0-9.]+)\\s*$`, 'm').exec(text);
    return m ? Number(m[1]) : undefined;
  };
  const width = top('Width');
  const height = top('Height');
  if (!width || !height) return undefined;
  const visuals = [...text.matchAll(/^\s+- (\w+)\s*:?\s*$/gm)].map((m) => m[1]!);
  return { width, height, visuals };
}

const num = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * La mise en page aux proportions `aspect` : étirée (les rectangles des visuels suivent la largeur ou
 * la hauteur), ou à l'identique au milieu (`contain`).
 */
function variant(text: string, layout: { width: number; height: number }, aspect: number, contain: boolean): string {
  const native = layout.width / layout.height;
  const wider = aspect >= native;
  const width = wider ? layout.height * aspect : layout.width;
  const height = wider ? layout.height : layout.width / aspect;
  const sx = width / layout.width;
  const sy = height / layout.height;
  const dx = (width - layout.width) / 2;
  const dy = (height - layout.height) / 2;
  return text
    .replace(/^Width:.*$/m, `Width: ${num(width)}`)
    .replace(/^Height:.*$/m, `Height: ${num(height)}`)
    .replace(/^(\s+Rect:\s*)\[([^\]]*)\]/gm, (all, lead: string, inner: string) => {
      const r = inner.split(',').map((v) => Number(v.trim()));
      if (r.length !== 4 || r.some((v) => !Number.isFinite(v))) return all;
      const [x, y, w, h] = r as [number, number, number, number];
      const next = contain ? [x + dx, y + dy, w, h] : [x * sx, y * sy, w * sx, h * sy];
      return `${lead}[${next.map(num).join(',')}]`;
    });
}

/**
 * Les mises en page à écrire pour celles d'origine : chacune à l'identique, et pour celles qui ne
 * montrent que des DMD, les variantes étirées et leurs deux bornes.
 */
export function scoreViewLayouts(originals: readonly ScvFile[]): ScvFile[] {
  const out: ScvFile[] = [];
  for (const file of originals) {
    out.push(file);
    const layout = readLayout(file.content);
    if (!layout || !layout.visuals.length || layout.visuals.some((v) => v !== 'DMD')) continue;
    const native = layout.width / layout.height;
    const { min, max } = scoreViewFillRange(native);
    const base = file.name.replace(/\.scv$/i, '');
    const add = (aspect: number, contain: boolean) =>
      out.push({
        name: `${base}~${contain ? 'contain' : 'fill'}-${Math.round(aspect * 1000)}.scv`,
        // En anglais, comme les mises en page de VPX : un commentaire du fichier, jamais montré.
        content: `# Cyber Pinball: ${file.name} ${contain ? 'centred' : 'stretched'} for a ${num(aspect)}:1 window (scoreviewlayouts.ts)\n${variant(file.content, layout, aspect, contain)}`,
      });
    add(min / STEP, true);
    for (let a = min; a <= max * 1.0001; a *= STEP) add(a, false);
    add(max * STEP, true);
  }
  return out;
}

/** Empreinte de ce qui décide du contenu du dossier : les fichiers d'origine et ces règles. */
function stampOf(files: readonly { name: string; data: Buffer }[]): string {
  const hash = crypto.createHash('sha256').update(`rules ${RULES_VERSION}\n`);
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) hash.update(f.name).update('\0').update(f.data);
  return hash.digest('hex');
}

/**
 * Prépare <données>\scoreview depuis les mises en page de VPX (<VPX>\plugins\scoreview\layouts) :
 * le chemin du dossier, ou undefined si VPX n'en a pas (le plugin garde alors les siennes).
 * Rien n'est réécrit quand rien n'a changé.
 */
export function prepareScoreViewLayouts(vpxLayoutsDir: string, dataDir: string): string | undefined {
  let names: string[];
  try {
    names = fs.readdirSync(vpxLayoutsDir).filter((n) => fs.statSync(path.join(vpxLayoutsDir, n)).isFile());
  } catch {
    return undefined;
  }
  const files = names.map((name) => ({ name, data: fs.readFileSync(path.join(vpxLayoutsDir, name)) }));
  const originals = files.filter((f) => /\.scv$/i.test(f.name));
  if (!originals.length) return undefined;
  const target = path.join(dataDir, SCOREVIEW_LAYOUTS_DIR);
  const stamp = stampOf(files);
  try {
    if ((JSON.parse(fs.readFileSync(path.join(target, STAMP), 'utf8')) as { stamp?: string }).stamp === stamp) return target;
  } catch {
    // Pas encore préparé, ou illisible : on le refait.
  }
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  // Les images de verre et le reste, à l'identique : les mises en page les nomment par un chemin relatif.
  for (const f of files.filter((f) => !/\.scv$/i.test(f.name))) fs.writeFileSync(path.join(target, f.name), f.data);
  for (const f of scoreViewLayouts(originals.map((f) => ({ name: f.name, content: f.data.toString('utf8') })))) fs.writeFileSync(path.join(target, f.name), f.content);
  writeFileAtomic(path.join(target, STAMP), JSON.stringify({ stamp, from: vpxLayoutsDir }, null, 2) + '\n');
  return target;
}
