// Médias qu'un PuP-Pack nomme mais qui manquent (26/11/2026 : Aliens, musiques A-TRACK ; The Matrix,
// TopperEnterMatrix.mp4 ; Monster Bash, dossiers RandomScoring et Monster). Le plugin PUP saute alors le
// média : un blanc, pas de plantage. Priorité : aucun faux positif. Ce module ne lit que le script de la
// table ; les .pup sont lus par pupfiles.ts, qui range le tout dans le même constat.
//
// Ne compte que ce qui est certain :
// - les chaînes littérales complètes (« "player" & n & ".wav" » n'est jamais lu) ;
// - le code, pas les commentaires (« ' » ou Rem) ;
// - un nom sans accent (la page de codes de Windows pourrait le lire autrement) ;
// - un fichier sans extension est retrouvé par son nom, sous n'importe quelle extension ;
// - un nom de fichier vide, ou « "" » : lecture au hasard, jamais une absence.

import { scriptCode } from './vbscript';

/** Un appel du script à une playlist de PuP, avec ce qu'il a de littéral. */
export interface PupScriptCall {
  /** « playlistplay » / « playlistplayex » jouent, « playlistadd » déclare. */
  kind: 'play' | 'add';
  folder: string;
  /** Fichier nommé (playlistplayex, troisième argument), tel que le script l'écrit. */
  file?: string;
  /** Le fichier est donné par une variable ou une concaténation : lecture non prévisible, jamais une alerte. */
  dynamicFile?: boolean;
}

/** Une chaîne littérale entière : « "x" » suivi d'une virgule, d'une parenthèse ou de la fin (pas de « & »). */
const LITERAL = '"([^"\\r\\n]*)"\\s*(?=,|\\)|$)';

/**
 * Appels PuPlayer.playlistplay / playlistplayex / playlistadd du script (commentaires retirés) dont le
 * dossier est une chaîne littérale. Le fichier n'est donné que s'il l'est aussi, en entier.
 */
export function pupScriptCalls(script: string | undefined): PupScriptCall[] {
  const out: PupScriptCall[] = [];
  for (const line of scriptCode(script ?? '').split('\n')) {
    for (const m of line.matchAll(new RegExp(`\\.playlist(playex|play|add)\\b\\s*\\(?\\s*[^,"\\r\\n]+,\\s*${LITERAL}(?:,\\s*${LITERAL})?`, 'gi'))) {
      const kind = m[1]!.toLowerCase() === 'add' ? 'add' : 'play';
      const folder = m[2]!;
      if (!folder.trim()) continue;
      const call: PupScriptCall = { kind, folder };
      // Le fichier : le troisième argument de playlistplayex, seulement s'il est littéral.
      if (m[1]!.toLowerCase() === 'playex' && m[3] !== undefined && m[3].trim()) call.file = m[3];
      if (m[1]!.toLowerCase() === 'playex' && m[3] === undefined && /^\s*,\s*[^\s,)]/.test(line.slice(m.index! + m[0].length))) call.dynamicFile = true;
      out.push(call);
    }
  }
  return out;
}

/** Nom que la comparaison ne peut pas trancher avec certitude : accent, chemin, caractère de contrôle. */
function uncertain(name: string): boolean {
  return /[^\x20-\x7e]/.test(name) || /[\\/]/.test(name);
}

/**
 * Le fichier nommé est-il absent de la playlist ? `files` : noms (minuscules) des fichiers du dossier.
 * Insensible à la casse ; un nom sans extension est retrouvé sous n'importe quelle extension (PinUP le
 * résout) ; un nom douteux n'est jamais déclaré absent.
 */
export function fileIsAbsent(files: Iterable<string>, wanted: string): boolean {
  const name = wanted.trim().toLowerCase();
  if (!name || uncertain(name)) return false;
  const bare = /\.[a-z0-9]{1,5}$/.test(name) ? undefined : name;
  for (const f of files) {
    const base = f.slice(f.lastIndexOf('\\') + 1);
    if (base === name || f === name) return false;
    if (bare !== undefined && base.replace(/\.[^.]*$/, '') === bare) return false;
  }
  return true;
}

/** Dossiers qui ne sont pas des playlists (options inactives, capture, polices). */
export const NOT_A_PLAYLIST = /^(pupcapture|fonts)$|option/i;

/**
 * Caractère interdit dans un nom Windows : la valeur n'est pas un nom de dossier ni de fichier. Les auteurs
 * séparent leurs déclencheurs par des lignes « ***MULTIBALL*** » parfois marquées actives (The Matrix,
 * 27/11/2026) : ce ne sont pas des déclencheurs, jamais une alerte ni un déclencheur compté.
 */
const NOT_A_NAME = /[*?"<>|:]/;

/** Ligne de .pup ou appel du script qui ne vise pas un vrai média : déclencheur, playlist ou fichier impossible. */
export function notAMediaTarget(...values: (string | undefined)[]): boolean {
  return values.some((v) => v !== undefined && NOT_A_NAME.test(v));
}
