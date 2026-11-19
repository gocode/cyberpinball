// Format des tables de VPX : quel VPX sait ouvrir une table enregistrée par un VPX plus récent.
//
// Chaque table garde la version du format de celui qui l'a enregistrée (flux GameStg/Version, readVpxFileVersion) :
// le CURRENT_FILE_FORMAT_VERSION de src/core/vpversion.h. VPX 10.8.0 écrit 1080, 10.8.1 (5436, celui de Cyber
// Pinball) 1081. Les préversions dites « 10.9 » (constructions « Actions » de GitHub) se numérotent toujours
// 10.8.1.<révision>, mais écrivent 1090 depuis le commit 7100688a0 (01/10/2026, texte rangé en UTF-8), révision 5963.
// Un VPX plus ancien que la table le dit par une fenêtre d'erreur (« saved with file version 10.90 and is newer than
// the supported file version 10.81 ») et la charge mal : sur une borne, la partie échoue.

/**
 * Constructions qui lisent un format plus récent que leur numéro ne le dit : à partir de cette révision, le format
 * lu (révision : nombre de commits depuis VERSION_START_SHA, .github/workflows/vpinball.yml, comme la 5436).
 */
const FORMAT_STEPS: { version: [number, number, number, number]; format: number }[] = [{ version: [10, 8, 1, 5963], format: 1090 }];

function versionParts(version: string): number[] {
  return version
    .split(/[.\-]/)
    .filter((p) => /^\d+$/.test(p))
    .map(Number);
}

/** a ≥ b, nombre par nombre (un nombre absent compte 0). */
function atLeast(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

/**
 * Le format le plus récent qu'ouvre un VPX d'après sa version (« 10.8.1.5436 », « 10.8.1-5436 ») : 10.8.0 → 1080,
 * 10.8.1 → 1081, 10.9.0 → 1090, et les préversions de FORMAT_STEPS. undefined : pas une version de VPX 10.
 */
export function vpxReadableFormat(version: string): number | undefined {
  const parts = versionParts(version);
  if (parts.length < 3 || parts[0] !== 10) return undefined;
  const [major, minor, rev] = parts as [number, number, number];
  let format = major * 100 + minor * 10 + Math.min(rev, 9);
  for (const step of FORMAT_STEPS) if (atLeast(parts, step.version) && step.format > format) format = step.format;
  return format;
}

/** Le numéro de VPX d'un format, tel que les joueurs le nomment : 1090 → « 10.9 », 1081 → « 10.8.1 ». */
export function vpxFormatName(format: number): string {
  const major = Math.floor(format / 100);
  const minor = Math.floor((format % 100) / 10);
  const rev = format % 10;
  return rev ? `${major}.${minor}.${rev}` : `${major}.${minor}`;
}

/** Ce VPX (sa version) lit-il les tables de ce format ? Format ou version inconnus : oui, rien n'est refusé. */
export function vpxReadsFormat(version: string | undefined, format: number | undefined): boolean {
  if (format === undefined || version === undefined) return true;
  const readable = vpxReadableFormat(version);
  return readable === undefined || format <= readable;
}

/**
 * Version lisible d'un VPX : les trois premiers nombres (« 10.8.0 »), et la révision quand elle lit un format plus
 * récent que son numéro (une préversion 10.9 numérotée « 10.8.1.6012 », qu'on ne confondrait pas avec la 10.8.1).
 */
export function vpxVersionName(version: string): string {
  const parts = versionParts(version);
  const short = parts.slice(0, 3).join('.');
  if (parts.length < 4 || parts[0] !== 10) return short;
  const plain = parts[0]! * 100 + parts[1]! * 10 + Math.min(parts[2]!, 9);
  return (vpxReadableFormat(version) ?? plain) > plain ? parts.slice(0, 4).join('.') : short;
}
