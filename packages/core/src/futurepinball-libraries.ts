// Bibliothèques (.fpl) dont une table de Future Pinball a besoin, et celles qui manquent dans le jeu lancé
// (25/11/2026, borne : Ghostbusters ouvrait sa partie sur « Unabled to Open Library - 'ghostbuster_sounds.fpl' »,
// « There will be some functions missing from the game »). Une table livrée en deux archives (la table, puis
// ses bibliothèques de sons) peut n'avoir reçu que la première ; Future Pinball ne le dit qu'à l'écran de la
// partie, derrière lequel Cyber Pinball ne voit rien.
//
// Le .fpt cite chaque ressource en clair, « NomDeBibliothèque.fpl\ressource.ogg » : on lit ces noms sans
// analyser le format (un .fpt fait jusqu'à 150 Mo : lecture par morceaux, recherche d'octets).
//
// Réparation sans rien demander, seulement avec ce que le PC a déjà : la bibliothèque d'une autre installation
// de Future Pinball (celle d'avant Cyber Pinball). Rien n'est écrasé. Les archives reçues et pas rangées
// (dossier des téléchargements) ne sont que nommées : les ouvrir coûte des secondes, et « Ajouter une table »
// les range déjà (futurepinball-archive.ts).

import * as fs from 'node:fs';
import * as path from 'node:path';

const LIBRARY_NAME = /^[A-Za-z0-9_\-. ()[\]]{1,80}\.fpl$/i;
/** Lecture par morceaux ; le recouvrement couvre le plus long nom de bibliothèque cité en bordure de morceau. */
const CHUNK = 8 << 20;
const OVERLAP = 128;
const MARKERS = ['.fpl\\', '.FPL\\'].map((s) => Buffer.from(s, 'latin1'));

/** Nom de bibliothèque qui finit juste avant l'octet `end` (exclu) de `buf` : la suite de caractères d'un nom. */
function nameBefore(buf: Buffer, end: number): string | undefined {
  let start = end;
  while (start > 0 && end - start < 80) {
    const c = buf[start - 1]!;
    // Lettres, chiffres, _ - . espace ( ) [ ] : un octet de contrôle ou une barre borne le nom.
    const ok = (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f || c === 0x2d || c === 0x2e || c === 0x20 || c === 0x28 || c === 0x29 || c === 0x5b || c === 0x5d;
    if (!ok) break;
    start--;
  }
  const name = `${buf.toString('latin1', start, end)}.fpl`.trimStart();
  return LIBRARY_NAME.test(name) ? name : undefined;
}

/**
 * Bibliothèques (.fpl) que ce .fpt cite, chacune une fois, avec l'orthographe du fichier. Un fichier
 * illisible : aucune (le jeu dira lui-même ce qui ne va pas).
 */
export async function futurePinballLibraryRefs(tableFile: string): Promise<string[]> {
  const found = new Map<string, string>();
  let handle: fs.promises.FileHandle | undefined;
  try {
    handle = await fs.promises.open(tableFile, 'r');
    const buf = Buffer.alloc(CHUNK + OVERLAP);
    let carry = 0;
    let pos = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buf, carry, CHUNK, pos);
      if (bytesRead === 0) break;
      const length = carry + bytesRead;
      const view = buf.subarray(0, length);
      for (const marker of MARKERS) {
        // Dans le recouvrement d'un morceau précédent, un nom déjà vu se retrouve : sans effet (Map).
        for (let at = view.indexOf(marker); at >= 0; at = view.indexOf(marker, at + 1)) {
          const name = nameBefore(view, at);
          if (name && !found.has(name.toLowerCase())) found.set(name.toLowerCase(), name);
        }
      }
      pos += bytesRead;
      carry = Math.min(OVERLAP, length);
      buf.copy(buf, 0, length - carry, length);
    }
  } catch {
    // Illisible : rien à constater.
  } finally {
    await handle?.close();
  }
  return [...found.values()];
}

/** Bibliothèques citées par la table qui ne sont pas dans le dossier Libraries du jeu. */
export interface FuturePinballLibraryCheck {
  /** Toutes celles que la table cite. */
  refs: string[];
  /** Celles qui manquent dans <jeu>\Libraries. */
  missing: string[];
}

export async function checkFuturePinballLibraries(gameDir: string, tableFile: string): Promise<FuturePinballLibraryCheck> {
  const refs = await futurePinballLibraryRefs(tableFile);
  let present = new Set<string>();
  try {
    present = new Set(fs.readdirSync(path.join(gameDir, 'Libraries')).map((n) => n.toLowerCase()));
  } catch {
    // Pas de dossier Libraries : tout manque.
  }
  return { refs, missing: refs.filter((r) => !present.has(r.toLowerCase())) };
}

export interface FuturePinballLibraryRepair {
  /** Copiées d'une autre installation dans <jeu>\Libraries. */
  copied: { name: string; from: string }[];
  /** Introuvables sur ce PC. */
  stillMissing: string[];
  /** Copies qui ont échoué (nom et cause). */
  failed: { name: string; reason: string }[];
}

/**
 * Remet dans <jeu>\Libraries les bibliothèques manquantes que `others` (dossiers de jeu d'autres
 * installations de Future Pinball) ont encore. Jamais d'écrasement, source intacte.
 */
export function repairFuturePinballLibraries(gameDir: string, missing: readonly string[], others: readonly string[]): FuturePinballLibraryRepair {
  const done: FuturePinballLibraryRepair = { copied: [], stillMissing: [], failed: [] };
  const target = path.join(gameDir, 'Libraries');
  for (const name of missing) {
    const source = others
      .filter((o) => path.resolve(o).toLowerCase() !== path.resolve(gameDir).toLowerCase())
      .map((o) => {
        const dir = path.join(o, 'Libraries');
        try {
          const real = fs.readdirSync(dir).find((n) => n.toLowerCase() === name.toLowerCase());
          return real ? path.join(dir, real) : undefined;
        } catch {
          return undefined;
        }
      })
      .find((f): f is string => Boolean(f));
    if (!source) {
      done.stillMissing.push(name);
      continue;
    }
    try {
      fs.mkdirSync(target, { recursive: true });
      fs.copyFileSync(source, path.join(target, name), fs.constants.COPYFILE_EXCL);
      done.copied.push({ name, from: source });
    } catch (error) {
      // Déjà là entre-temps (COPYFILE_EXCL) : rien à remettre.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') done.failed.push({ name, reason: (error as Error).message });
    }
  }
  return done;
}

const ARCHIVE_EXT = new Set(['.rar', '.zip', '.7z']);

/** Mots d'un nom de fichier, en minuscules, sans l'extension (« ghostbusters_table_sounds-libs-v1.3 » → ghostbusters, table…). */
function words(name: string): string[] {
  return path.basename(name, path.extname(name)).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
}

/**
 * Archives reçues (dossier des téléchargements, deux niveaux) dont le nom ressemble à une bibliothèque qui
 * manque : même mot de cinq lettres ou plus (« ghostbuster » pour « ghostbuster_sounds.fpl »). Un indice
 * pour le joueur, pas une preuve : le contenu n'est pas ouvert.
 */
export function archivesLikelyHolding(downloadsDir: string, missing: readonly string[]): string[] {
  const wanted = new Set(missing.flatMap(words).map((w) => w.replace(/s$/, '')));
  const hits: string[] = [];
  const visit = (dir: string, level: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (level < 2) visit(p, level + 1);
      } else if (ARCHIVE_EXT.has(path.extname(e.name).toLowerCase()) && words(e.name).some((w) => wanted.has(w.replace(/s$/, '')))) hits.push(p);
    }
  };
  visit(downloadsDir, 0);
  return hits.sort();
}

/**
 * Lignes du journal pour une table : ce qui manque, ce qui a été remis, ce qui reste à faire. Aucune ligne
 * quand la table a toutes ses bibliothèques.
 */
export function futurePinballLibraryReport(input: { tableName: string; check: FuturePinballLibraryCheck; repair?: FuturePinballLibraryRepair; archives?: readonly string[] }): string[] {
  const { tableName, check, repair, archives = [] } = input;
  if (!check.missing.length) return [];
  const lines: string[] = [];
  lines.push(`Bibliothèques : « ${tableName} » en cite ${check.refs.length}, ${check.missing.length} manque(nt) dans le dossier Libraries du jeu : ${check.missing.join(', ')}.`); // i18n-ignore : journal
  if (repair?.copied.length) lines.push(`Bibliothèques : ${repair.copied.length} remise(s) depuis une autre installation de Future Pinball (${repair.copied.map((c) => c.name).join(', ')}), sans rien écraser.`); // i18n-ignore : journal
  for (const f of repair?.failed ?? []) lines.push(`Bibliothèques : ${f.name} pas copiée (${f.reason}).`); // i18n-ignore : journal
  const left = repair ? repair.stillMissing : check.missing;
  if (left.length) {
    lines.push(`Bibliothèques : ${left.join(', ')} introuvable(s) sur ce PC ; la partie démarre quand même, avec des fonctions en moins (sons, musiques, images de ces bibliothèques).`); // i18n-ignore : journal
    lines.push(
      archives.length
        ? `Bibliothèques : archive(s) reçue(s) peut-être pas rangée(s) : ${archives.join(' ; ')}. « Ajouter une table » dessus les range dans le jeu.` // i18n-ignore : journal
        : 'Bibliothèques : une table livrée en deux archives (la table, puis ses bibliothèques) veut les deux ; ajoute l’archive des bibliothèques avec « Ajouter une table ».', // i18n-ignore : journal
    );
  }
  return lines;
}
