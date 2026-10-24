import { fingerprintOf, modelKeyOfScreen } from './fingerprint';
import type { ObservedDisplay, PhysicalScreen } from './model';

export interface MatchResult {
  /** Empreinte enregistrée -> écran observé correspondant. */
  matched: Map<string, ObservedDisplay>;
  /** Empreintes enregistrées introuvables. */
  missing: string[];
  /** Écrans observés qui ne correspondent à aucun écran enregistré. */
  unknown: ObservedDisplay[];
  /** Empreintes faibles retrouvées par leur modèle seulement (câble changé de port). */
  approximate: string[];
}

/**
 * Retrouve les écrans enregistrés parmi les écrans observés, sans jamais se
 * fier au numéro Windows ni à la position sur le bureau.
 */
export function matchScreens(saved: PhysicalScreen[], observed: ObservedDisplay[]): MatchResult {
  const matched = new Map<string, ObservedDisplay>();
  const approximate: string[] = [];
  const free = new Set(observed);

  // 1. Correspondance exacte de l'empreinte.
  for (const screen of saved) {
    const hit = [...free].find((d) => fingerprintOf(d).key === screen.fingerprint);
    if (hit) {
      matched.set(screen.fingerprint, hit);
      free.delete(hit);
    }
  }

  // 2. Empreintes faibles : même modèle, s'il n'y a aucune ambiguïté.
  for (const screen of saved) {
    if (matched.has(screen.fingerprint) || screen.strength !== 'weak') continue;
    const model = modelKeyOfScreen(screen);
    const candidates = [...free].filter((d) => fingerprintOf(d).modelKey === model);
    const sameModelSaved = saved.filter(
      (s) => !matched.has(s.fingerprint) && modelKeyOfScreen(s) === model,
    );
    if (candidates.length === 1 && sameModelSaved.length === 1) {
      matched.set(screen.fingerprint, candidates[0]!);
      free.delete(candidates[0]!);
      approximate.push(screen.fingerprint);
    }
  }

  const missing = saved.filter((s) => !matched.has(s.fingerprint)).map((s) => s.fingerprint);
  return { matched, missing, unknown: [...free], approximate };
}
