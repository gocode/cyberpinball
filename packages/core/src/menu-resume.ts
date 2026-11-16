// Reprise du menu après une relance par lui-même (retour du bureau avec un quart de tour de
// l'écran, langue, type de DMD, configuration…) : le nouveau processus revient là où était
// l'ancien, au lieu de la roue sur la table de départ.
//
// 16/11/2026 : revenir du bureau ramenait toujours sur la roue, la rubrique d'où l'on était parti
// perdue ; la table sélectionnée aussi (« Table au démarrage » choisit la dernière jouée, pas la
// dernière regardée). La place passe d'un processus à l'autre par la ligne de commande.

/** Où était le menu : la table sélectionnée, la rubrique du menu système et l'entrée choisie (la collection active est déjà enregistrée). */
export interface MenuResume {
  /** Fichier de la table sélectionnée sur la roue. */
  table?: string;
  /** Menu système ouvert : sa rubrique (absente : la racine) et l'entrée sur laquelle était la sélection. */
  system?: { group?: string; chosen?: string };
}

/** Préfixe de l'argument : « --reprendre-menu=<JSON encodé> ». */
export const RESUME_FLAG = '--reprendre-menu=';

/** L'argument à donner au nouveau processus ; undefined s'il n'y a rien à reprendre. */
export function resumeArg(resume: MenuResume): string | undefined {
  const clean = cleanResume(resume);
  return clean ? RESUME_FLAG + encodeURIComponent(JSON.stringify(clean)) : undefined;
}

/** La reprise passée par la relance, s'il y en a une lisible. */
export function readResume(argv: readonly string[]): MenuResume | undefined {
  const arg = [...argv].reverse().find((a) => a.startsWith(RESUME_FLAG));
  if (!arg) return undefined;
  try {
    return cleanResume(JSON.parse(decodeURIComponent(arg.slice(RESUME_FLAG.length))) as unknown);
  } catch {
    return undefined;
  }
}

/** Les arguments sans reprise : une relance n'hérite jamais de celle d'avant. */
export function withoutResume(argv: readonly string[]): string[] {
  return argv.filter((a) => !a.startsWith(RESUME_FLAG));
}

/** Ne garde que des chaînes non vides aux places attendues ; undefined si rien ne reste. */
function cleanResume(value: unknown): MenuResume | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);
  const out: MenuResume = {};
  const table = text(raw.table);
  if (table) out.table = table;
  if (raw.system && typeof raw.system === 'object') {
    const sys = raw.system as Record<string, unknown>;
    const group = text(sys.group);
    const chosen = text(sys.chosen);
    out.system = { ...(group ? { group } : {}), ...(chosen ? { chosen } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}
