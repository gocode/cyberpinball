// Déclencheurs « D » d'un PuP-Pack reconnus sur les images de FlexDMD (prototype, 28 octobre 2026).
// Le plugin PUP de VPX 10.8.1 compare chaque image du DMD aux captures du pack
// (PupCapture\<n>.bmp) et envoie « D<n> » à la première qui correspond ; mais il ne reçoit
// d'images que des sources qui fournissent une « identify frame » (B2SPluginEventStream.cpp
// l. 236-250, PUPManager.cpp l. 98-110 au commit af26b2d93), et FlexDMD n'en fournit pas
// (FlexDMDPlugin.cpp l. 556 : « TODO we should also provide identify frame »). Sur une table
// sans ROM dont le DMD est dessiné par FlexDMD, ces vidéos ne jouent donc jamais.
// Le script, lui, lit l'image de FlexDMD : FlexDMD.DmdPixels rend 128 × 32 octets, un par
// point, aux 16 niveaux 0, 17 … 255 en GRAY_4 (FlexDMD.cpp, UpdateLumFrame), en tableau de
// Variant (DynamicScript.cpp l. 631-690). Cyber Pinball ajoute au .vbs une Sub qui refait la
// reconnaissance de libpupdmd (DMD::Load, DMD::MatchIndexed) sur cette image, à chaque tour du
// minuteur d'images de la table, et envoie B2SData "D<n>", 1 puis 0 comme le plugin.
// Recherche : docs/recherche/pupcapture-flexdmd.md.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DMD_HEIGHT, DMD_WIDTH } from './livedmd';
import { commentStart } from './vbscript';

const PIXELS = DMD_WIDTH * DMD_HEIGHT;

/** Couleur du cadre qui délimite la zone comparée d'une capture (PUPDMD_MASK_R/G/B). */
const MASK = [253, 0, 253] as const;

/** Profondeur du DMD de FlexDMD : 2 bits (4 niveaux, GRAY_2) ou 4 bits (16 niveaux, GRAY_4). */
export type DmdDepth = 2 | 4;

export interface CaptureRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CaptureImage {
  /** Numéro du déclencheur (« D<id> »), tiré du nom du fichier. */
  id: number;
  /** Zone comparée : le cadre de masque de la capture, ou toute l'image. */
  region: CaptureRegion;
  /** Valeur que FlexDMD.DmdPixels donne à chaque point quand l'image est celle de la capture. */
  pixels: Uint8Array;
}

const FULL: CaptureRegion = { x: 0, y: 0, w: DMD_WIDTH, h: DMD_HEIGHT };

/** Niveau d'un point d'une capture d'après son rouge, comme libpupdmd (« les DMD de PupCapture sont orange »). */
function captureLevel(r: number, depth: DmdDepth): number {
  if (r === MASK[0] || r < 8) return 0;
  const steps = depth === 2 ? [48, 128] : [24, 48, 56, 72, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240];
  let level = 1;
  for (const s of steps) if (r >= s) level++;
  return level;
}

/**
 * Une capture lue comme libpupdmd (DMD::Load) : BMP 24 bits non compressé, de bas en haut, de
 * 128 × 32 (les seules que le plugin compare à un DMD de 128 × 32). undefined sinon.
 */
export function readCaptureBmp(file: Buffer, depth: DmdDepth): { region: CaptureRegion; pixels: Uint8Array } | undefined {
  if (file.length < 54 || file.toString('latin1', 0, 2) !== 'BM') return undefined;
  const fileSize = file.readUInt32LE(2);
  const dataOffset = file.readUInt32LE(10);
  const width = file.readInt32LE(18);
  const height = file.readInt32LE(22);
  const compression = file.readUInt32LE(30);
  const imageSize = file.readUInt32LE(34);
  if (compression !== 0 || width !== DMD_WIDTH || height !== DMD_HEIGHT) return undefined;
  const size = imageSize === 0 ? fileSize - dataOffset : imageSize;
  if (size !== width * height * 3 || dataOffset + size > file.length) return undefined;
  const pixels = new Uint8Array(PIXELS);
  const unit = depth === 2 ? 85 : 17;
  // Cadre de masque : coin haut gauche au premier point de la couleur du masque, largeur et hauteur
  // comptées sur sa ligne et sa colonne (octets non signés, comme dans libpupdmd).
  let mx = 255;
  let my = 255;
  let mw = 0;
  let mh = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = dataOffset + ((height - 1 - y) * width + x) * 3;
      const [b, g, r] = [file[o]!, file[o + 1]!, file[o + 2]!];
      pixels[y * width + x] = captureLevel(r, depth) * unit;
      if (r === MASK[0] && g === MASK[1] && b === MASK[2]) {
        if (mx === 255) {
          mx = x;
          my = y;
        } else if (mx < 192) {
          if (y === my) mw = (mw + 1) & 0xff;
          else if (x === mx) mh = (mh + 1) & 0xff;
        }
      }
    }
  }
  const region = mx < 192 ? { x: mx + 1, y: my + 1, w: (mw - 1) & 0xff, h: (mh - 1) & 0xff } : FULL;
  if (region.x + region.w > width || region.y + region.h > height) return undefined;
  return { region, pixels };
}

/** Les captures 128 × 32 du pack (dossier PupCapture, sans tenir compte de la casse), par numéro croissant. */
export function readCaptures(root: string, depth: DmdDepth): CaptureImage[] {
  const dir = readDirents(root).find((d) => d.isDirectory() && d.name.toLowerCase() === 'pupcapture');
  if (!dir) return [];
  const byId = new Map<number, CaptureImage>();
  for (const entry of readDirents(path.join(root, dir.name))) {
    // Même motif que libpupdmd : « (\d+)\.bmp » cherché dans le nom.
    const m = /(\d+)\.bmp/i.exec(entry.name);
    if (!entry.isFile() || !m) continue;
    let file: Buffer;
    try {
      file = fs.readFileSync(path.join(root, dir.name, entry.name));
    } catch {
      continue;
    }
    const image = readCaptureBmp(file, depth);
    if (image) byId.set(Number(m[1]), { id: Number(m[1]), ...image });
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/**
 * Empreinte d'une zone de l'image, calculée à l'identique par le VBScript (nombres à virgule
 * exacts sous 2^53 : h × 31 + 256 reste sous 4·10^10).
 */
export function regionHash(pixels: ArrayLike<number>, r: CaptureRegion): number {
  let h = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let i = y * DMD_WIDTH + r.x; i < y * DMD_WIDTH + r.x + r.w; i++) {
      h = h * 31 + pixels[i]! + 1;
      h = h - Math.floor(h / 1000000007) * 1000000007;
    }
  }
  return h;
}

/** Caractère d'un point dans une clé de témoins (niveau en hexadécimal, comme Hex(px(i) \ 17)). */
function probeChar(value: number): string {
  return Math.floor(value / 17).toString(16).toUpperCase();
}

/**
 * Points témoins communs aux captures sans masque : choisis un à un pour séparer le plus
 * d'images différentes (à égalité, le point allumé dans le plus de captures, pour qu'une image
 * de jeu ordinaire, souvent noire à ces endroits, ressemble rarement à une capture). Au moins
 * `min` témoins même quand moins suffisent à séparer les captures (5 pour Game of Thrones) :
 * chaque témoin de plus écarte d'emblée davantage d'images de jeu, sans calcul d'empreinte.
 */
export function fullProbes(captures: CaptureImage[], min = 16, max = 24): number[] {
  const probes: number[] = [];
  if (!captures.length) return probes;
  const n = captures.length;
  const distinct = new Set(captures.map((c) => Buffer.from(c.pixels).toString('base64'))).size;
  // Nombre de captures allumées en chaque point (départage, puis seul critère une fois les images séparées).
  const lit = new Int32Array(PIXELS);
  for (const c of captures) for (let p = 0; p < PIXELS; p++) if (c.pixels[p]! > 0) lit[p]!++;
  // Groupe de chaque capture (mêmes niveaux aux témoins déjà choisis), renuméroté à chaque tour ;
  // les couples (groupe, niveau) vus pour un point sont marqués par tour de boucle (`stamp`).
  let groups = new Int32Array(n);
  let count = 1;
  const seen = new Int32Array(n * 16);
  let stamp = 0;
  const level = (v: number) => Math.floor(v / 17) & 15;
  while (probes.length < Math.min(max, PIXELS) && count < distinct) {
    let best = -1;
    let bestCount = -1;
    for (let p = 0; p < PIXELS; p++) {
      if (probes.includes(p)) continue;
      stamp++;
      let split = 0;
      for (let i = 0; i < n; i++) {
        const k = groups[i]! * 16 + level(captures[i]!.pixels[p]!);
        if (seen[k] !== stamp) {
          seen[k] = stamp;
          split++;
        }
      }
      if (split > bestCount || (split === bestCount && lit[p]! > lit[best]!)) {
        best = p;
        bestCount = split;
      }
    }
    probes.push(best);
    const ids = new Map<number, number>();
    const next = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const k = groups[i]! * 16 + level(captures[i]!.pixels[best]!);
      if (!ids.has(k)) ids.set(k, ids.size);
      next[i] = ids.get(k)!;
    }
    groups = next;
    count = ids.size;
  }
  // Images séparées : les témoins suivants sont les points allumés dans le plus de captures.
  const byLit = Array.from({ length: PIXELS }, (_, p) => p)
    .filter((p) => !probes.includes(p))
    .sort((a, b) => lit[b]! - lit[a]! || a - b);
  while (probes.length < Math.min(min, max) && byLit.length) probes.push(byLit.shift()!);
  return probes;
}

/** Points témoins d'une capture masquée : ses points allumés répartis sur la zone, puis des points noirs. */
export function regionProbes(capture: CaptureImage, count = 8): number[] {
  const { region: r, pixels } = capture;
  const lit: number[] = [];
  const dark: number[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) (pixels[y * DMD_WIDTH + x]! > 0 ? lit : dark).push(y * DMD_WIDTH + x);
  }
  const fromLit = spread(lit, count - Math.min(2, dark.length));
  return [...fromLit, ...spread(dark, count - fromLit.length)];
}

/** n éléments répartis régulièrement dans la liste (tous si elle est plus courte). */
function spread(list: number[], n: number): number[] {
  const k = Math.min(n, list.length);
  return Array.from({ length: Math.max(0, k) }, (_, i) => list[Math.floor(((i + 0.5) * list.length) / k)]!);
}

/** Où brancher la reconnaissance dans le script. */
export interface CaptureWatch {
  /** Variable de l'objet FlexDMD dans le script (« FlexDMD »). */
  flex: string;
  /** Variable de l'objet PinUpPlayer.PinDisplay qui a lancé le pack (« CyberPinball_PuP », « PuPlayer »). */
  pup: string;
  /** Minuteur de la table appelé à chaque image (« FrameTimer ») : la reconnaissance part au début de sa Sub <minuteur>_Timer. */
  timer: string;
}

/** Reconnaissance posée dans un .vbs : où elle est branchée, et pour quelles captures. */
export interface PupCapture extends CaptureWatch {
  /** Dossier du pack dans pupvideos. */
  pack: string;
  depth: DmdDepth;
  /** Empreinte des fichiers de PupCapture (captureSignature) : le bloc est refait quand elle change. */
  sig: string;
}

const WATCH_SUB = 'CyberPinball_PuPCapture';
/**
 * Début de la première ligne du bloc ajouté au .vbs ; la suite est le JSON de ses réglages
 * (PupCapture). Lue dans le .vbs, comme le reste du script : en anglais, sans accent (latin1).
 */
export const CAPTURE_HEAD = "' Cyber Pinball PupCapture: PuP-Pack D triggers matched on the FlexDMD frame ";
/** Intervalle minimal entre deux lectures de l'image, en millisecondes de GameTime. */
export const WATCH_INTERVAL_MS = 20;
/** Une même liste de candidates n'est revérifiée qu'après ce délai (image fixe à l'écran). */
export const WATCH_RECHECK_MS = 250;

/**
 * Lignes VBScript de la reconnaissance : les données des captures, la Sub appelée à chaque
 * image, et l'empreinte. Ce que fait le plugin, dans le même ordre : la première capture (par
 * numéro croissant) dont la zone est identique déclenche « D<n> », sauf si c'est déjà la dernière
 * reconnue (DMD::MatchIndexed).
 */
export function captureWatchLines(captures: CaptureImage[], watch: PupCapture): string[] {
  const full = captures.filter((c) => c.region.w === DMD_WIDTH && c.region.h === DMD_HEIGHT);
  const masked = captures.filter((c) => !full.includes(c));
  const probes = fullProbes(full);
  const P = 'CyberPinball_PuPCap';
  const data: string[] = [];
  for (const c of full) {
    const key = probes.map((p) => probeChar(c.pixels[p]!)).join('');
    data.push(`${P}Full.Item("${key}") = ${P}Join(${P}Full.Item("${key}"), Array(${c.id}, 0, 0, ${DMD_WIDTH}, ${DMD_HEIGHT}, ${regionHash(c.pixels, c.region)}))`);
  }
  masked.forEach((c, i) => {
    const pr = regionProbes(c);
    const r = c.region;
    data.push(`${P}Masked(${i}) = Array(${c.id}, ${r.x}, ${r.y}, ${r.w}, ${r.h}, ${regionHash(c.pixels, r)}, Array(${pr.join(', ')}), Array(${pr.map((p) => c.pixels[p]!).join(', ')}))`);
  });
  const { flex, pup } = watch;
  const settings: PupCapture = { pack: watch.pack, flex, pup, timer: watch.timer, depth: watch.depth, sig: watch.sig };
  return [
    CAPTURE_HEAD + JSON.stringify(settings),
    `Dim ${P}Full, ${P}Masked, ${P}Probes, ${P}Last, ${P}Next, ${P}Sig, ${P}SigUntil`,
    `Sub ${P}Init`,
    `  Set ${P}Full = CreateObject("Scripting.Dictionary")`,
    `  ReDim ${P}Masked(${masked.length - 1})`,
    `  ${P}Probes = Array(${probes.join(', ')})`,
    `  ${P}Last = 0 : ${P}Next = 0 : ${P}Sig = ""`,
    ...data.map((l) => `  ${l}`),
    `End Sub`,
    `Function ${P}Join(a, b)`,
    `  Dim r : If IsArray(a) Then r = a : ReDim Preserve r(UBound(r) + 1) : r(UBound(r)) = b : ${P}Join = r Else ${P}Join = Array(b)`,
    `End Function`,
    `Function ${P}Hash(px, x, y, w, h)`,
    `  Dim hh, i, j : hh = 0`,
    `  For j = y To y + h - 1`,
    `    For i = j * ${DMD_WIDTH} + x To j * ${DMD_WIDTH} + x + w - 1`,
    `      hh = hh * 31 + px(i) + 1 : hh = hh - Int(hh / 1000000007) * 1000000007`,
    `    Next`,
    `  Next`,
    `  ${P}Hash = hh`,
    `End Function`,
    `Sub ${WATCH_SUB}`,
    `  On Error Resume Next`,
    `  If IsEmpty(${P}Full) Then ${P}Init`,
    `  If GameTime < ${P}Next Then Exit Sub`,
    `  ${P}Next = GameTime + ${WATCH_INTERVAL_MS}`,
    `  If Not IsObject(${flex}) Or Not IsObject(${pup}) Then Exit Sub`,
    `  Dim px, key, p, c, cands, n, i, j, t, sig, ok`,
    `  px = ${flex}.DmdPixels`,
    `  If Err Then Err.Clear : Exit Sub`,
    `  If Not IsArray(px) Then Exit Sub`,
    `  If UBound(px) <> ${PIXELS - 1} Then Exit Sub`,
    `  key = ""`,
    `  For Each p In ${P}Probes : key = key & Hex(px(p) \\ 17) : Next`,
    `  ReDim cands(${captures.length}) : n = 0 : sig = key`,
    `  If ${P}Full.Exists(key) Then`,
    `    For Each c In ${P}Full.Item(key) : If n <= UBound(cands) Then cands(n) = c : n = n + 1`,
    `    Next`,
    `  End If`,
    `  For Each c In ${P}Masked`,
    `    ok = True`,
    `    For i = 0 To UBound(c(6)) : If px(c(6)(i)) <> c(7)(i) Then ok = False : Exit For`,
    `    Next`,
    `    If ok And n <= UBound(cands) Then cands(n) = c : n = n + 1 : sig = sig & "|" & c(0)`,
    `  Next`,
    `  If n = 0 Then ${P}Sig = sig : Exit Sub`,
    `  If sig = ${P}Sig And GameTime < ${P}SigUntil Then Exit Sub`,
    `  ${P}Sig = sig : ${P}SigUntil = GameTime + ${WATCH_RECHECK_MS}`,
    `  For i = 1 To n - 1 : For j = i To 1 Step -1`,
    `    If cands(j)(0) < cands(j - 1)(0) Then t = cands(j) : cands(j) = cands(j - 1) : cands(j - 1) = t`,
    `  Next : Next`,
    `  For i = 0 To n - 1`,
    `    c = cands(i)`,
    `    If ${P}Hash(px, c(1), c(2), c(3), c(4)) = c(5) Then`,
    `      If c(0) <> ${P}Last Then ${P}Last = c(0) : ${pup}.B2SData "D" & c(0), 1 : ${pup}.B2SData "D" & c(0), 0`,
    `      Exit Sub`,
    `    End If`,
    `  Next`,
    `End Sub`,
  ];
}

/**
 * Le script avec la reconnaissance (`lines`, captureWatchLines) : l'appel au début de Sub
 * <minuteur>_Timer (sur la ligne de la Sub : les numéros de ligne ne bougent pas), le bloc à la
 * place de celui déjà là, sinon après la dernière ligne. undefined si le minuteur n'a pas de Sub
 * dans le script ou s'il n'y a rien à ajouter.
 */
export function addCaptureWatch(script: string, timer: string, lines: string[]): string | undefined {
  if (!lines.length) return undefined;
  const eol = /\r\n/.test(script) ? '\r\n' : '\n';
  const rows = script.split(/\r?\n/);
  const name = timer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const head = new RegExp(`^(\\s*(?:(?:public|private)\\s+)?sub\\s+${name}_timer\\b(?:\\s*\\(\\s*\\))?)`, 'i');
  const call = new RegExp(`:\\s*${WATCH_SUB}\\b`, 'i');
  const block = blockRange(rows);
  let found = false;
  for (let i = 0; i < rows.length && !found; i++) {
    if (block && i >= block.start && i <= block.end) continue;
    const line = rows[i]!;
    const at = commentStart(line);
    const code = at < 0 ? line : line.slice(0, at);
    if (!head.test(code)) continue;
    if (!call.test(code)) rows[i] = line.replace(head, `$1 : ${WATCH_SUB}`);
    found = true;
  }
  if (!found) return undefined;
  if (block) {
    rows.splice(block.start, block.end - block.start + 1, ...lines);
    return rows.join(eol);
  }
  let text = rows.join(eol);
  if (text && !/\r?\n$/.test(text)) text += eol;
  return text + lines.join(eol) + eol;
}

/** Lignes du bloc de reconnaissance dans un script : de son en-tête à la fin de Sub CyberPinball_PuPCapture. */
function blockRange(rows: string[]): { start: number; end: number } | undefined {
  const start = rows.findIndex((l) => l.startsWith(CAPTURE_HEAD));
  if (start < 0) return undefined;
  const sub = rows.findIndex((l, i) => i > start && new RegExp(`^Sub ${WATCH_SUB}\\s*$`).test(l));
  const end = sub < 0 ? -1 : rows.findIndex((l, i) => i > sub && /^End Sub\s*$/.test(l));
  return end < 0 ? undefined : { start, end };
}

/** Le bloc de reconnaissance d'un script, et ses réglages ; undefined s'il n'y en a pas (ou abîmé). */
export function captureBlock(script: string): { settings: PupCapture; lines: string[] } | undefined {
  const rows = script.split(/\r?\n/);
  const range = blockRange(rows);
  if (!range) return undefined;
  try {
    const settings = JSON.parse(rows[range.start]!.slice(CAPTURE_HEAD.length)) as PupCapture;
    if (typeof settings.pack !== 'string' || typeof settings.timer !== 'string' || typeof settings.sig !== 'string') return undefined;
    return { settings, lines: rows.slice(range.start, range.end + 1) };
  } catch {
    return undefined;
  }
}

/** Mêmes réglages : même pack, mêmes variables, même minuteur, même profondeur, mêmes captures. */
export function sameCapture(a: PupCapture, b: PupCapture): boolean {
  return a.pack === b.pack && a.flex === b.flex && a.pup === b.pup && a.timer.toLowerCase() === b.timer.toLowerCase() && a.depth === b.depth && a.sig === b.sig;
}

/**
 * Empreinte des captures du pack : noms et contenus des fichiers que lit libpupdmd, triés.
 * Lue avant chaque partie : quelques Mo à lire, rien à décoder.
 */
export function captureSignature(root: string): string {
  const dir = readDirents(root).find((d) => d.isDirectory() && d.name.toLowerCase() === 'pupcapture');
  const hash = createHash('sha1');
  if (dir) {
    const files = readDirents(path.join(root, dir.name))
      .filter((e) => e.isFile() && /(\d+)\.bmp/i.test(e.name))
      .map((e) => e.name)
      .sort();
    for (const name of files) {
      hash.update(`${name}\n`);
      try {
        hash.update(fs.readFileSync(path.join(root, dir.name, name)));
      } catch {
        hash.update('?');
      }
    }
  }
  return hash.digest('hex').slice(0, 16);
}

/** Pourquoi la reconnaissance ne peut pas être branchée sur ce script. */
export type CaptureBlocker = 'flex' | 'depth' | 'timer' | 'pup';

/**
 * Réglages de la reconnaissance pour ce script (sans commentaires, scriptCode) : l'objet FlexDMD,
 * sa profondeur, le minuteur d'images, et l'objet du pack (`pup` : CyberPinball_PuP quand le .vbs
 * de Cyber Pinball lance le pack ; sinon celui que le script crée).
 */
export function captureSettings(code: string, pack: string, root: string, pup?: string): PupCapture | { blocker: CaptureBlocker } {
  const flex = findFlexDmdObject(code);
  if (!flex) return { blocker: 'flex' };
  const depth = flexRenderDepth(code);
  if (!depth) return { blocker: 'depth' };
  const timer = findFrameTimer(code);
  if (!timer) return { blocker: 'timer' };
  const object = pup ?? findPupObject(code);
  if (!object) return { blocker: 'pup' };
  return { pack, flex, pup: object, timer, depth, sig: captureSignature(root) };
}

/** Variable à laquelle le script affecte CreateObject("PinUpPlayer.PinDisplay"). */
export function findPupObject(code: string): string | undefined {
  return /\bset\s+([a-z_]\w*)\s*=\s*createobject\s*\(\s*"pinupplayer\.pindisplay"\s*\)/i.exec(code)?.[1];
}

/** Variable à laquelle le script affecte CreateObject("FlexDMD.FlexDMD"). */
export function findFlexDmdObject(code: string): string | undefined {
  return /\bset\s+([a-z_]\w*)\s*=\s*createobject\s*\(\s*"flexdmd\.flexdmd"\s*\)/i.exec(code)?.[1];
}

/** Profondeur du DMD choisie par le script (.RenderMode) ; undefined pour un DMD en couleurs ou à segments. */
export function flexRenderDepth(code: string): DmdDepth | undefined {
  const m = /\.rendermode\s*=\s*(?:flexdmd_rendermode_dmd_gray_([24])\b|(\d+)\b)/i.exec(code);
  if (!m) return undefined;
  if (m[1]) return m[1] === '2' ? 2 : 4;
  return m[2] === '0' ? 2 : m[2] === '1' ? 4 : undefined;
}

/**
 * Minuteur appelé à chaque image : celui dont le script met l'intervalle à -1 (« FrameTimer.Interval
 * = -1 ») et qui a sa Sub <minuteur>_Timer.
 */
export function findFrameTimer(code: string): string | undefined {
  for (const m of code.matchAll(/^\s*([a-z_]\w*)\.interval\s*=\s*-1\b/gim)) {
    if (new RegExp(`^\\s*(?:(?:public|private)\\s+)?sub\\s+${m[1]}_timer\\b`, 'im').test(code)) return m[1];
  }
  return undefined;
}

/**
 * Reconnaissance de référence, en TypeScript : ce que fait libpupdmd (DMD::MatchIndexed) sur une
 * image, et ce que doit faire le VBScript. `last` : dernier déclencheur reconnu. Rend le
 * déclencheur à envoyer (0 : aucun) et le nouveau dernier.
 */
export function matchCapture(captures: CaptureImage[], frame: ArrayLike<number>, last: number): { trigger: number; last: number } {
  // Empreinte de l'image entière calculée une fois pour toutes les captures sans masque, comme libpupdmd.
  let full: number | undefined;
  for (const c of captures) {
    const isFull = c.region.w === DMD_WIDTH && c.region.h === DMD_HEIGHT;
    const h = isFull ? (full ??= regionHash(frame, c.region)) : regionHash(frame, c.region);
    if (h !== captureHash(c)) continue;
    return c.id === last ? { trigger: 0, last } : { trigger: c.id, last: c.id };
  }
  return { trigger: 0, last };
}

const hashes = new WeakMap<CaptureImage, number>();

function captureHash(c: CaptureImage): number {
  let h = hashes.get(c);
  if (h === undefined) hashes.set(c, (h = regionHash(c.pixels, c.region)));
  return h;
}

function readDirents(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
