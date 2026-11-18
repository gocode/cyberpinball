// Images du DMD qu'une table montre par FlexDMD (« VPX.nom », rangées dans le .vpx), chargées pendant le chargement de
// la table plutôt qu'en pleine partie.
//
// Le plugin FlexDMD de VPX 10.8.1 (plugins/flexdmd/resources/AssetManager.cpp, VPXFile::GetImage) lit chaque image dans
// le .vpx et décode son PNG ou JPEG la première fois qu'elle s'affiche, sur le fil de VPX : la partie s'arrête le temps
// de le faire. Rapport d'une borne du 18/11/2026 (Hellboy, Daredevil, tables de JP) : 14 des 17 arrêts relevés, et tous
// ceux de plus d'une demi-seconde, suivaient de quelques millisecondes « Bitmap added to cache: VPX.… ». FlexDMD garde
// chaque image chargée (m_cachedBitmaps) ; ses variantes (« &dmd=2&add ») sont dérivées de l'image de base gardée, sans
// relire le fichier. Le .vbs de Cyber Pinball demande donc chaque image une fois, juste après « FlexDMD.Run = True »,
// pendant l'écran de chargement : en partie, elle est déjà là.
//
// Les noms : chez JP, ce sont des chaînes du script (« d_a », « bkborder ») passées à
// FlexDMD.NewImage("", "VPX." & nom & "&dmd=2") (docs/JPSalas.md de FlexDMD) ; ailleurs, des chaînes « VPX.nom&… »
// écrites en entier. Seules les chaînes qui sont le nom d'une image de la table comptent (la liste du .vpx), et les
// suffixes d'options écrits dans le script (« &dmd=2&add ») sont repris tels quels.

import { commentStart, scriptCode } from './vbscript';

/** Ce que le .vbs de Cyber Pinball charge d'avance : l'objet FlexDMD du script et les images demandées. */
export interface FlexPrewarm {
  variable: string;
  images: string[];
}

/**
 * Au plus tant de demandes (images et variantes). Une table de JP en fait plusieurs centaines : Daredevil, 178 images
 * en trois variantes, était coupé à la 135e avec 400 (rapport du 18/11/2026). Une image se charge en 1 à 2 ms.
 */
export const FLEX_PREWARM_MAX = 3000;
const SUB = 'CyberPinball_FlexPrewarm';

/** La variable à laquelle le script donne son objet FlexDMD (« Set FlexDMD = CreateObject("FlexDMD.FlexDMD") »). */
export function flexDmdVariable(code: string): string | undefined {
  return /\bSet\s+([A-Za-z_]\w*)\s*=\s*CreateObject\s*\(\s*"FlexDMD\.FlexDMD"\s*\)/i.exec(code)?.[1];
}

function literals(code: string): string[] {
  return [...code.matchAll(/"((?:[^"\n]|"")*)"/g)].map((m) => m[1]!.replace(/""/g, '"'));
}

/**
 * Les options d'image que FlexDMD reconnaît (AssetManager.cpp, ResolveSrc : « dmd= », « dmd2= », « add », « region= »,
 * « pad= »), écrites en entier. Une autre chaîne commençant par « & » (paramètres d'une adresse web dans le script de
 * Hellboy, « &session_time= ») n'en est pas une ; et « region= » ou « pad= » incomplets font lire à FlexDMD des
 * nombres absents (il ne vérifie leur compte que dans une version de débogage) : jamais demandés.
 */
export function isFlexImageOptions(suffix: string): boolean {
  if (!suffix.startsWith('&') || suffix.length < 2) return false;
  return suffix
    .slice(1)
    .split('&')
    .every((token) => /^(?:dmd2?=\d+|add|region=\d+,\d+,\d+,\d+|pad=\d+,\d+,\d+,\d+)$/i.test(token));
}

/**
 * Débuts de noms que le script complète (« "d_" & lettre », « "VPX.d_" & n ») : les images de la table qui commencent
 * ainsi sont celles qu'il montrera. Chez Hellboy, les lettres du DMD (d_a… d_z, d_1a…) ne sont écrites nulle part en
 * entier : elles se chargeaient en partie malgré le chargement d'avance (rapport du 18/11/2026).
 */
function builtPrefixes(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/"((?:[^"\n]|"")*)"\s*&/g)) {
    const s = m[1]!.replace(/^VPX\./i, '');
    if (s.length >= 2 && /^[\w.-]+$/.test(s)) out.add(s.toLowerCase());
  }
  return [...out];
}

/** Au-delà, une image de la table n'est pas une image de DMD (une texture du plateau) : jamais chargée d'avance sans être nommée. */
export const FLEX_DMD_IMAGE_MAX = { width: 1024, height: 512 };

/**
 * Les images à charger d'avance pour ce script, d'après les images du .vpx (`images` : nom et dimensions) ; undefined
 * quand le script ne montre pas d'images « VPX. » par FlexDMD, ou qu'il n'a pas de « FlexDMD.Run = True » où brancher le
 * chargement. Un nom « VPX.nom&… » écrit en entier compte toujours. Un nom seul (« d_a ») ne compte que si le script
 * fabrique ses noms (« "VPX." & nom », tables de JP) et que l'image a la taille d'une image de DMD : un script nomme
 * aussi les textures de son plateau, qu'il ne faut pas charger dans FlexDMD.
 */
export function flexPrewarmFor(script: string, images: readonly { name: string; width: number; height: number }[]): FlexPrewarm | undefined {
  const code = scriptCode(script);
  const variable = flexDmdVariable(code);
  if (!variable || !/"VPX\./i.test(code) || !runLines(code, variable).length) return undefined;
  const byLower = new Map(images.map((n) => [n.name.toLowerCase(), n] as const));
  const builds = /"VPX\."\s*&/i.test(code);
  const strings = literals(code);
  // Suffixes d'options écrits à part (« & "&dmd=2&add" ») : les variantes que le script demandera.
  const suffixes = [...new Set(strings.filter(isFlexImageOptions))];
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (ids.length < FLEX_PREWARM_MAX && !seen.has(id.toLowerCase())) {
      seen.add(id.toLowerCase());
      ids.push(id);
    }
  };
  const dmdSized = (image: { width: number; height: number }) => image.width <= FLEX_DMD_IMAGE_MAX.width && image.height <= FLEX_DMD_IMAGE_MAX.height;
  const addBuilt = (name: string) => {
    add(`VPX.${name}`);
    for (const suffix of suffixes) add(`VPX.${name}${suffix}`);
  };
  for (const s of strings) {
    const full = /^VPX\.([^&]+)(&.*)?$/i.exec(s);
    if (full) {
      const image = byLower.get(full[1]!.toLowerCase());
      if (image) {
        add(`VPX.${image.name}`);
        if (full[2] && isFlexImageOptions(full[2])) add(`VPX.${image.name}${full[2]}`);
      }
      continue;
    }
    const image = builds ? byLower.get(s.toLowerCase()) : undefined;
    if (image && dmdSized(image)) addBuilt(image.name);
  }
  // Noms complétés par le script : les images de DMD de la table qui commencent comme eux.
  if (builds) {
    const prefixes = builtPrefixes(code);
    for (const image of images) {
      const lower = image.name.toLowerCase();
      if (dmdSized(image) && prefixes.some((p) => lower.startsWith(p) && lower.length > p.length)) addBuilt(image.name);
    }
  }
  return ids.length ? { variable, images: ids } : undefined;
}
/** Lignes (à partir de 0) où le script lance son FlexDMD (« FlexDMD.Run = True »), hors commentaires. */
function runLines(code: string, variable: string): number[] {
  const re = new RegExp(`\\b${variable}\\s*\\.\\s*Run\\s*=\\s*(True|1)\\b`, 'i');
  return code.split('\n').flatMap((line, i) => (re.test(line) ? [i] : []));
}

/**
 * Le script avec le chargement d'avance : l'appel posé au bout de chaque ligne qui lance FlexDMD (même ligne, numéros
 * de ligne inchangés), et la Sub qui demande chaque image ajoutée à la fin. undefined si le lancement n'est plus là.
 */
export function addFlexPrewarm(text: string, prewarm: FlexPrewarm): string | undefined {
  const parts = text.split(/(\r?\n)/);
  const lines = runLines(scriptCode(text), prewarm.variable);
  if (!lines.length) return undefined;
  for (const n of lines) {
    const line = parts[n * 2]!;
    const at = commentStart(line);
    const code = at < 0 ? line : line.slice(0, at);
    const comment = at < 0 ? '' : line.slice(at);
    parts[n * 2] = `${code.trimEnd()} : ${SUB} ${prewarm.variable}${comment ? ` ${comment}` : ''}`;
  }
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  let out = parts.join('');
  if (!/\r?\n$/.test(out)) out += eol;
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const body = [`Sub ${SUB}(f)`, '  On Error Resume Next', ...prewarm.images.map((id) => `  f.NewImage "", ${quote(id)}`), 'End Sub'];
  return out + body.join(eol) + eol;
}

/** Le chargement d'avance est-il dans ce texte (un .vbs déjà écrit) ? */
export function hasFlexPrewarm(text: string): boolean {
  return new RegExp(`^\\s*Sub\\s+${SUB}\\b`, 'im').test(text);
}
