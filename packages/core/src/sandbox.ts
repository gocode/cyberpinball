// Garde-fou des essais sans opérateur : avec un bac à sable (CYBERPINBALL_HOME) et un
// pilote automatique, des captures ou un test d'endurance, rien ne doit s'écrire hors
// du bac à sable. Deux incidents l'ont montré : un chemin recopié d'un vrai modèle de
// borne, puis un paramètre d'installeur ignoré, ont suffi à toucher la vraie racine.

import * as os from 'node:os';
import * as path from 'node:path';
import { isInside } from './fileops';

export interface SandboxPolicy {
  /** Dossiers où l'écriture reste permise. */
  allowed: string[];
}

/** Variables qui signalent un essai sans opérateur. */
const UNATTENDED = ['CYBERPINBALL_AUTOPILOT', 'CYBERPINBALL_CAPTURE', 'CYBERPINBALL_STRESS'];

/**
 * Politique du bac à sable pour cet environnement, ou undefined quand il n'y a pas
 * lieu d'en avoir une (usage normal, ou essai sans bac à sable volontaire).
 */
export function sandboxPolicy(env: NodeJS.ProcessEnv, cwd: string): SandboxPolicy | undefined {
  const home = env.CYBERPINBALL_HOME;
  if (!home || !UNATTENDED.some((name) => env[name])) return undefined;
  const allowed = [home, env.CYBERPINBALL_ROOT, path.join(cwd, 'tmp'), os.tmpdir()]
    .filter((p): p is string => Boolean(p))
    .map((p) => path.resolve(cwd, p));
  return { allowed };
}

export function isWriteAllowed(policy: SandboxPolicy, target: string, cwd: string): boolean {
  const full = path.resolve(cwd, target);
  return policy.allowed.some((dir) => isInside(full, dir));
}
