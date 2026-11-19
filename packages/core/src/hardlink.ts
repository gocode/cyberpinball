// Liens physiques NTFS : reprendre une installation existante (PinUP Popper, PinballX, PinballY, VPX
// seul) sans en dupliquer les gros fichiers. Le 19/11/2026, des joueurs l'ont dit le premier frein à
// l'essai sur une borne déjà montée : l'import copiait tout, et un joueur de plus de 600 tables a
// abandonné après une erreur pendant la copie.
//
// Un lien physique est un second nom pour les mêmes données : aucune place en plus sur le disque, et
// l'installation d'origine garde ses fichiers tels quels. Supprimer, renommer ou mettre à la
// corbeille l'un des deux noms ne touche pas l'autre. Une seule chose est dangereuse : écrire DANS
// le fichier (le tronquer, y ajouter, le réécrire en place) modifie aussi l'original. D'où deux règles :
//
// 1. Ne lier que les gros fichiers que personne ne réécrit (LINKABLE) : table .vpx, fronton
//    .directb2s, vidéos, images, sons, ROM .zip, couleurs. Tout ce qui est petit ou modifiable
//    (.pup, .ini, .vbs, .pov, .cfg, .xml, .txt, nvram…) est copié. Les dossiers sont toujours de
//    vrais dossiers chez nous : on ne lie que des fichiers (jamais de jonction : un rangement qui en
//    suivait une a vidé sa cible le 29/10/2026).
// 2. Garde centrale (installHardLinkGuard, branchée au démarrage de l'application) : toute écriture
//    sur place dans un fichier qui a plus d'un nom (nlink > 1) coupe d'abord le lien. Le fichier
//    écrit devient un fichier à lui ; l'autre nom garde ses octets et sa date.
//
// Pas de lien d'un disque à l'autre, ni sur un volume qui n'en a pas (FAT32, exFAT, réseau) : copie,
// fichier par fichier, sans erreur visible (linkOrCopy).

import type * as FsModule from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renameWithRetry } from './atomicwrite';

// Le vrai module : la garde le modifie pour tous les modules qui le lisent (comme sandbox-guard.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs: typeof FsModule = require('node:fs');

/** Codes d'un lien physique impossible : autre volume, système de fichiers sans liens, 1023 liens atteints. */
export const LINK_FALLBACK_CODES: ReadonlySet<string> = new Set(['EXDEV', 'EPERM', 'ENOTSUP', 'EINVAL', 'EMLINK', 'EACCES', 'ENOSYS']);

/**
 * Extensions des fichiers liés plutôt que copiés : gros, et jamais réécrits par Cyber Pinball, VPX,
 * PinMAME ni le plugin PUP. Un .vpx n'est réécrit que par l'éditeur de VPX (« Save ») : la borne
 * le lance en partie, jamais en édition.
 */
export const LINKABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  // Tables et frontons
  '.vpx', '.directb2s',
  // Vidéos
  '.mp4', '.m4v', '.webm', '.avi', '.mkv', '.mov', '.f4v', '.flv', '.wmv', '.mpg', '.mpeg',
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.apng', '.tga',
  // Sons et musique
  '.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac', '.wma', '.opus',
  // ROM et couleurs (Serum)
  '.zip', '.crz', '.cromc',
]);

/** Un fichier de ce nom est-il lié plutôt que copié à l'import ? */
export function isLinkable(file: string): boolean {
  return LINKABLE_EXTENSIONS.has(path.extname(file).toLowerCase());
}

/** Nombre de noms du fichier (1 : un fichier à lui seul) ; 0 s'il n'existe pas ou n'est pas un fichier. */
export function linkCount(file: string): number {
  const st = fs.lstatSync(file, { throwIfNoEntry: false });
  return st?.isFile() ? st.nlink : 0;
}

/**
 * Crée `to` comme lien physique de `from`, ou comme copie quand le lien est impossible (autre
 * volume, FAT32, réseau…). `to` ne doit pas exister. Rend ce qui a été fait.
 */
export function linkOrCopy(from: string, to: string): 'linked' | 'copied' {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.linkSync(from, to);
    return 'linked';
  } catch (error) {
    if (!LINK_FALLBACK_CODES.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    return 'copied';
  }
}

/** Fichier temporaire à côté de `file` (même dossier, donc même volume : un renommage suffit). */
function besidePath(file: string, tag: string): string {
  const base = `${file}.${tag}-${process.pid}`;
  let p = base;
  for (let i = 2; originals.existsSync(p); i++) p = `${base}-${i}`;
  return p;
}

/**
 * Coupe le lien d'un fichier qui a plus d'un nom, avant d'y écrire : `keep` vrai (ajout, écriture
 * au milieu, date), le fichier devient une copie à lui seul, mêmes octets et même date ; faux (il va
 * être réécrit en entier), son nom est simplement retiré. L'autre nom ne change pas. Rend vrai si
 * un lien a été coupé. Un fichier tenu ouvert par un autre programme lève l'erreur : mieux vaut une
 * écriture refusée qu'un original modifié.
 */
export function detachHardLink(file: string, keep = true): boolean {
  const st = originals.lstatSync(file, { throwIfNoEntry: false });
  if (!st?.isFile() || st.nlink <= 1) return false;
  if (!keep) {
    originals.unlinkSync(file);
    return true;
  }
  const tmp = besidePath(file, 'lien');
  try {
    originals.copyFileSync(file, tmp, fs.constants.COPYFILE_EXCL);
    originals.utimesSync(tmp, st.atime, st.mtime);
    renameWithRetry(tmp, file);
  } catch (error) {
    originals.rmSync(tmp, { force: true });
    throw error;
  }
  return true;
}

// ---------- Garde centrale ----------

type Fn = (...args: unknown[]) => unknown;

/** Les fonctions d'origine, avant la garde : celles qu'elle appelle elle-même. */
const originals = {
  lstatSync: fs.lstatSync,
  existsSync: fs.existsSync,
  unlinkSync: fs.unlinkSync,
  copyFileSync: fs.copyFileSync,
  utimesSync: fs.utimesSync,
  rmSync: fs.rmSync,
};

/** Chemin d'un argument de fs (texte, Buffer, URL) ; undefined pour un descripteur. */
function pathOf(arg: unknown): string | undefined {
  if (typeof arg === 'string') return arg;
  if (Buffer.isBuffer(arg)) return arg.toString();
  if (arg instanceof URL) return arg.protocol === 'file:' ? fileURLToPath(arg) : undefined;
  return undefined;
}

/** Ce qu'une ouverture fait du contenu : rien (lecture), le remplace en entier, ou le modifie en place. */
type Effect = 'none' | 'replace' | 'modify';

function flagEffect(flags: unknown, fallback: string): Effect {
  if (typeof flags === 'number') {
    const c = fs.constants;
    // O_EXCL : l'ouverture échoue sur un fichier existant, rien à préparer.
    if (!(flags & (c.O_WRONLY | c.O_RDWR)) || flags & c.O_EXCL) return 'none';
    // Sans O_CREAT, l'ouverture exige le fichier : il ne peut pas être mis de côté, il est détaché.
    return flags & c.O_TRUNC && flags & c.O_CREAT ? 'replace' : 'modify';
  }
  const f = String(flags ?? fallback);
  if (f.includes('x')) return 'none';
  if (f.startsWith('w')) return 'replace';
  if (f.startsWith('a') || f.includes('+')) return 'modify';
  return 'none';
}

/** Drapeau d'écriture des options de writeFile, appendFile (flag), createWriteStream (flags). */
function optionFlag(options: unknown, fallback: string): unknown {
  if (!options || typeof options !== 'object') return fallback;
  const o = options as { flag?: unknown; flags?: unknown };
  return o.flags ?? o.flag ?? fallback;
}

/**
 * Prépare l'écriture : un fichier à plusieurs noms qui va être modifié en place devient une copie à
 * lui ; s'il va être remplacé en entier, son nom est mis de côté (renommé à côté), rendu pour être
 * retiré après l'écriture réussie ou remis en place si elle échoue.
 */
function prepare(target: string | undefined, effect: Effect): string | undefined {
  if (!target || effect === 'none') return undefined;
  const st = originals.lstatSync(target, { throwIfNoEntry: false });
  if (!st?.isFile() || st.nlink <= 1) return undefined;
  if (effect === 'modify') {
    detachHardLink(target, true);
    return undefined;
  }
  const aside = besidePath(target, 'lien');
  renameWithRetry(target, aside);
  return aside;
}

/** Après l'écriture : le nom mis de côté est retiré, ou remis à sa place si l'écriture a échoué sans rien laisser. */
function settle(aside: string | undefined, target: string | undefined, failed: boolean): void {
  if (!aside || !target) return;
  try {
    if (failed && !originals.existsSync(target)) renameWithRetry(aside, target);
    else originals.unlinkSync(aside);
  } catch {
    // Rien de plus à faire : l'original (l'autre nom) est intact dans tous les cas.
  }
}

let installed = false;

/**
 * Branche la garde sur le module fs (une fois par processus) : writeFile, appendFile, copyFile,
 * open, truncate, utimes, chmod et createWriteStream, synchrones, à rappel et en promesse. Toute
 * écriture dans un fichier qui a plus d'un nom coupe d'abord le lien : jamais un original modifié
 * par une écriture de Cyber Pinball. Coût : un lstat par écriture d'un fichier existant.
 */
export function installHardLinkGuard(): void {
  if (installed) return;
  installed = true;
  const wrap = (api: object, name: string, effect: (args: unknown[]) => { target?: string; effect: Effect }) => {
    const record = api as Record<string, Fn>;
    const original = record[name];
    if (typeof original !== 'function') return;
    const promised = api === fs.promises;
    record[name] = function (this: unknown, ...args: unknown[]) {
      const e = effect(args);
      let aside: string | undefined;
      try {
        aside = prepare(e.target, e.effect);
      } catch (error) {
        if (promised) return Promise.reject(error);
        const callback = args.at(-1);
        if (typeof callback === 'function' && name !== 'createWriteStream') {
          process.nextTick(() => (callback as Fn)(error));
          return undefined;
        }
        throw error;
      }
      if (!aside) return original.apply(this, args);
      // Rappel (fs.copyFile(a, b, cb)) : le nom mis de côté se règle à l'appel du rappel.
      const last = args.length - 1;
      if (!promised && typeof args[last] === 'function') {
        const callback = args[last] as Fn;
        args[last] = (error: unknown, ...rest: unknown[]) => {
          settle(aside, e.target, Boolean(error));
          return callback(error, ...rest);
        };
        return original.apply(this, args);
      }
      let result: unknown;
      try {
        result = original.apply(this, args);
      } catch (error) {
        settle(aside, e.target, true);
        throw error;
      }
      if (result instanceof Promise) {
        return result.then(
          (value) => (settle(aside, e.target, false), value),
          (error) => {
            settle(aside, e.target, true);
            throw error;
          },
        );
      }
      settle(aside, e.target, false);
      return result;
    };
  };
  const callbacks = (args: unknown[]) => args.filter((a) => typeof a !== 'function');
  const writeFile = (fallback: string) => (args: unknown[]) => ({ target: pathOf(args[0]), effect: flagEffect(optionFlag(callbacks(args)[2], fallback), fallback) });
  const copyFile = (args: unknown[]) => {
    const mode = callbacks(args)[2];
    return { target: pathOf(args[1]), effect: typeof mode === 'number' && mode & fs.constants.COPYFILE_EXCL ? ('none' as const) : ('replace' as const) };
  };
  const open = (args: unknown[]) => ({ target: pathOf(args[0]), effect: flagEffect(callbacks(args)[1], 'r') });
  const modify = (args: unknown[]) => ({ target: pathOf(args[0]), effect: 'modify' as const });
  for (const api of [fs, fs.promises] as object[]) {
    const sync = api === fs ? ['', 'Sync'] : [''];
    for (const suffix of sync) {
      wrap(api, `writeFile${suffix}`, writeFile('w'));
      wrap(api, `appendFile${suffix}`, writeFile('a'));
      wrap(api, `copyFile${suffix}`, copyFile);
      wrap(api, `open${suffix}`, open);
      for (const name of ['truncate', 'utimes', 'chmod']) wrap(api, `${name}${suffix}`, modify);
    }
  }
  wrap(fs, 'createWriteStream', (args) => ({ target: pathOf(args[0]), effect: flagEffect(optionFlag(args[1], 'w'), 'w') }));
}
