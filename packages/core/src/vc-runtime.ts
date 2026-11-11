// Le runtime Visual C++ de Microsoft (vcruntime140.dll, vcruntime140_1.dll, msvcp140.dll), dont VPX a
// besoin dès son démarrage : freeimage64.dll et SDL364.dll, chargés par VPinballX, les importent, comme
// la plupart de ses plugins (PinMAME, DMDUtil, Serum, PUP, DOF…). L'archive de VPX ne les contient pas,
// et un Windows fraîchement installé ne les a pas toujours : VPX ne démarre alors pas du tout
// (0xC0000135, « VCRUNTIME140.dll introuvable »). Ici, de quoi le savoir sans rien lancer : la version
// des DLL de System32, les DLL qu'un exécutable importe, l'éditeur de liens qui l'a produit.
//
// Le runtime doit être au moins aussi récent que les outils qui ont compilé VPX (règle de Microsoft) :
// le manifeste note cette version (components.json, vpx.vcRuntime), relevée sur les fichiers de VPX
// (`vpxRuntimeNeeds`), et le composant « vc-redist-x64 » installe le runtime officiel s'il manque.

import { compareVersions } from './acquisition';

/** Les DLL du runtime que VPX et ses plugins importent (Visual C++ 2015 et suivants, x64). */
export const VC_RUNTIME_DLLS = ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll'] as const;

/**
 * Bibliothèques de redistribuables, absentes d'un Windows neuf : un exécutable qui en importe une sans
 * la fournir dépend d'une installation à part (runtime Visual C++, DirectX d'origine, OpenAL…).
 * Les DLL de Windows lui-même (kernel32, user32, ucrtbase, api-ms-win-*…) n'y figurent pas.
 */
const REDISTRIBUTABLE_DLL = /^(vcruntime\d+(_\d+)?d?|msvcp\d+(_[a-z_]+)?d?|msvcr\d+d?|vcomp\d+d?|concrt\d+d?|vccorlib\d+d?|mfc\d+u?d?|ucrtbased|d3dx\w+|d3dcompiler_(?!47\.)\d+|xinput1_[123]|xaudio2_[0-7]|x3daudio1_\d|openal32)\.dll$/i;

/** Bibliothèque qu'aucun Windows neuf ne fournit (versions de débogage des runtimes comprises). */
export function isRedistributableDll(name: string): boolean {
  return REDISTRIBUTABLE_DLL.test(name);
}

interface PeLayout {
  linker: string;
  directory(index: number): { rva: number; size: number } | undefined;
  offset(rva: number): number | undefined;
  section(name: string): { start: number; end: number } | undefined;
}

/** En-têtes d'un exécutable Windows (PE32 ou PE32+), ou undefined si ce n'en est pas un. */
function peLayout(buf: Buffer): PeLayout | undefined {
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) return undefined; // « MZ »
  const pe = buf.readUInt32LE(0x3c);
  if (pe + 24 > buf.length || buf.readUInt32LE(pe) !== 0x00004550) return undefined; // « PE\0\0 »
  const sections = buf.readUInt16LE(pe + 6);
  const optSize = buf.readUInt16LE(pe + 20);
  const opt = pe + 24;
  const magic = buf.readUInt16LE(opt);
  if (magic !== 0x10b && magic !== 0x20b) return undefined;
  const dirs = opt + (magic === 0x20b ? 112 : 96);
  const dirCount = buf.readUInt32LE(dirs - 4);
  const table: { name: string; va: number; vsize: number; raw: number; rsize: number }[] = [];
  for (let i = 0; i < sections; i++) {
    const s = opt + optSize + i * 40;
    if (s + 40 > buf.length) break;
    table.push({ name: buf.toString('latin1', s, s + 8).replace(/\0+$/, ''), vsize: buf.readUInt32LE(s + 8), va: buf.readUInt32LE(s + 12), rsize: buf.readUInt32LE(s + 16), raw: buf.readUInt32LE(s + 20) });
  }
  return {
    linker: `${buf[opt + 2]}.${String(buf[opt + 3]).padStart(2, '0')}`,
    directory: (index) => (index < dirCount ? { rva: buf.readUInt32LE(dirs + index * 8), size: buf.readUInt32LE(dirs + index * 8 + 4) } : undefined),
    offset: (rva) => {
      const s = table.find((x) => rva >= x.va && rva < x.va + Math.max(x.vsize, x.rsize));
      const off = s ? rva - s.va + s.raw : undefined;
      return off !== undefined && off < buf.length ? off : undefined;
    },
    section: (name) => {
      const s = table.find((x) => x.name === name);
      return s ? { start: s.raw, end: Math.min(buf.length, s.raw + s.rsize) } : undefined;
    },
  };
}

const cString = (buf: Buffer, at: number) => {
  const end = buf.indexOf(0, at);
  return buf.toString('latin1', at, end < 0 ? buf.length : end);
};

/** Les DLL qu'importe un exécutable (en minuscules), [] s'il n'en importe aucune ou n'en est pas un. */
export function peImports(buf: Buffer): string[] {
  const layout = peLayout(buf);
  const dir = layout?.directory(1);
  if (!layout || !dir?.rva) return [];
  const out: string[] = [];
  for (let at = layout.offset(dir.rva); at !== undefined && at + 20 <= buf.length; at += 20) {
    const name = buf.readUInt32LE(at + 12);
    if (name === 0) break;
    const off = layout.offset(name);
    if (off !== undefined) out.push(cString(buf, off).toLowerCase());
  }
  return out;
}

/** Version de l'éditeur de liens qui a produit l'exécutable (« 14.51 » : Visual C++ 14.51). */
export function peLinkerVersion(buf: Buffer): string | undefined {
  return peLayout(buf)?.linker;
}

/** Version du fichier (VS_FIXEDFILEINFO de ses ressources), « 14.52.37029.0 » ; undefined sans elle. */
export function peFileVersion(buf: Buffer): string | undefined {
  const layout = peLayout(buf);
  const rsrc = layout?.section('.rsrc');
  if (!rsrc) return undefined;
  const signature = Buffer.from([0xbd, 0x04, 0xef, 0xfe]);
  const at = buf.subarray(rsrc.start, rsrc.end).indexOf(signature);
  if (at < 0) return undefined;
  const p = rsrc.start + at;
  if (p + 16 > buf.length) return undefined;
  const ms = buf.readUInt32LE(p + 8);
  const ls = buf.readUInt32LE(p + 12);
  return `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`;
}

export interface VcRuntimeStatus {
  ok: boolean;
  /** Version que VPX demande au moins. */
  required: string;
  /** DLL absentes de System32. */
  missing: string[];
  /** DLL présentes mais plus anciennes que `required`, avec leur version. */
  older: { dll: string; version: string }[];
}

/**
 * Le runtime de Windows suffit-il à VPX ? `versions` : la version de chaque DLL de VC_RUNTIME_DLLS dans
 * System32 (undefined : absente, ou sans version lisible).
 */
export function vcRuntimeStatus(versions: Readonly<Record<string, string | undefined>>, required: string): VcRuntimeStatus {
  const missing: string[] = [];
  const older: { dll: string; version: string }[] = [];
  for (const dll of VC_RUNTIME_DLLS) {
    const version = versions[dll];
    if (!version) missing.push(dll);
    else if (!(compareVersions(version, required) >= 0)) older.push({ dll, version });
  }
  return { ok: !missing.length && !older.length, required, missing, older };
}

/** Un exécutable d'un dossier de VPX : son chemin relatif et son contenu. */
export interface PeFile {
  path: string;
  buf: Buffer;
}

export interface VpxRuntimeNeeds {
  /** Plus récent éditeur de liens des fichiers qui importent le runtime : la version minimale de celui-ci. */
  vcRuntime?: string;
  /** Fichiers qui importent le runtime Visual C++. */
  importers: string[];
  /** Bibliothèques de redistribuables importées, ni fournies dans le dossier, ni couvertes par le runtime Visual C++. */
  unknown: { dll: string; by: string[] }[];
}

/**
 * Ce que les fichiers d'une version de VPX demandent à Windows en plus de lui-même : le runtime Visual
 * C++ (et sa version minimale), et toute autre bibliothèque de redistribuable qu'ils ne fournissent pas.
 * Une nouvelle version de VPX qui en demanderait une autre se voit ici (et dans le test qui le vérifie).
 * `files` est lu une fois, fichier par fichier (rien n'est gardé) ; `shippedNames` : tous les fichiers
 * du dossier, pour savoir ce qu'il fournit lui-même.
 */
export function vpxRuntimeNeeds(files: Iterable<PeFile>, shippedNames: Iterable<string>): VpxRuntimeNeeds {
  const shipped = new Set([...shippedNames].map((n) => n.split(/[\\/]/).pop()!.toLowerCase()));
  const runtime = new Set<string>(VC_RUNTIME_DLLS);
  const importers: string[] = [];
  const unknown = new Map<string, string[]>();
  let vcRuntime: string | undefined;
  for (const file of files) {
    const imports = peImports(file.buf);
    if (imports.some((d) => runtime.has(d))) {
      importers.push(file.path);
      const linker = peLinkerVersion(file.buf);
      if (linker && (!vcRuntime || compareVersions(linker, vcRuntime) > 0)) vcRuntime = linker;
    }
    for (const dll of imports) {
      if (shipped.has(dll) || runtime.has(dll) || !isRedistributableDll(dll)) continue;
      unknown.set(dll, [...(unknown.get(dll) ?? []), file.path]);
    }
  }
  return { ...(vcRuntime && { vcRuntime }), importers, unknown: [...unknown].map(([dll, by]) => ({ dll, by })) };
}
